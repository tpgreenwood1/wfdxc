import { describe, expect, it } from "vitest";
import { describeIssues, findRaceIssues, ordinal } from "@/lib/raceIssues";
import { raceReadiness, schoolEventProgress, schoolRaceState } from "@/lib/raceSchoolStatus";

const rows = (...positions: number[]) =>
  positions.map((position, i) => ({ id: `r${i}`, position }));

describe("findRaceIssues", () => {
  it("reports nothing for a clean 1..n sequence", () => {
    const issues = findRaceIssues(rows(1, 2, 3, 4));
    expect(issues.duplicates).toEqual([]);
    expect(issues.gaps).toEqual([]);
    expect(issues.openCount).toBe(0);
  });

  it("flags duplicate places with the result ids that share them", () => {
    const issues = findRaceIssues(rows(1, 2, 2, 3));
    expect(issues.duplicates).toEqual([
      { position: 2, resultIds: ["r1", "r2"], acknowledged: false },
    ]);
    expect(issues.openDuplicates).toBe(1);
  });

  it("flags missing places from 1 up to the last claimed place", () => {
    const issues = findRaceIssues(rows(3, 4, 7));
    expect(issues.gaps.map((g) => g.position)).toEqual([1, 2, 5, 6]);
    expect(issues.openGaps).toBe(4);
  });

  it("treats acknowledged ties and gaps as accepted, not open", () => {
    const issues = findRaceIssues(rows(1, 2, 2, 4), [
      { position: 2, kind: "tie" },
      { position: 3, kind: "gap", note: "non-league runner" },
    ]);
    expect(issues.duplicates[0].acknowledged).toBe(true);
    expect(issues.gaps).toEqual([
      { position: 3, acknowledged: true, note: "non-league runner" },
    ]);
    expect(issues.openCount).toBe(0);
  });

  it("ignores stale acks for places that are no longer flagged", () => {
    const issues = findRaceIssues(rows(1, 2, 3), [
      { position: 2, kind: "tie" },
      { position: 9, kind: "gap" },
    ]);
    expect(issues.duplicates).toEqual([]);
    expect(issues.gaps).toEqual([]);
  });

  it("handles an empty race", () => {
    expect(findRaceIssues([]).openCount).toBe(0);
  });
});

describe("ordinal / describeIssues", () => {
  it("formats places", () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 101].map((n) => ordinal(n))).toEqual([
      "1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "101st",
    ]);
    expect(ordinal(5, true)).toBe("=5th");
  });

  it("describes open issues", () => {
    expect(describeIssues({ openDuplicates: 1, openGaps: 2 })).toEqual([
      "1 duplicate place",
      "2 missing places",
    ]);
    expect(describeIssues({ openDuplicates: 0, openGaps: 0 })).toEqual([]);
  });
});

describe("school / race readiness", () => {
  it("derives a school's state for a race", () => {
    expect(schoolRaceState(0, undefined)).toBe("not_started");
    expect(schoolRaceState(0, "no_runners")).toBe("no_runners");
    expect(schoolRaceState(0, "done")).toBe("no_runners");
    expect(schoolRaceState(3, undefined)).toBe("entering");
    expect(schoolRaceState(3, "no_runners")).toBe("entering");
    expect(schoolRaceState(3, "done")).toBe("done");
  });

  it("is ready only with results, no open issues and every school confirmed", () => {
    const base = { openIssues: 0, totalEntries: 10, schoolStates: ["done", "no_runners", "done"] as const };
    expect(raceReadiness({ ...base, schoolStates: [...base.schoolStates] }).ready).toBe(true);
    expect(
      raceReadiness({ ...base, schoolStates: ["done", "no_runners", "entering"] })
    ).toMatchObject({ ready: false, entering: 1 });
    expect(raceReadiness({ ...base, schoolStates: [...base.schoolStates], openIssues: 1 }).ready).toBe(false);
    expect(raceReadiness({ ...base, schoolStates: [...base.schoolStates], totalEntries: 0 }).ready).toBe(false);
    const r = raceReadiness({ ...base, schoolStates: ["done", "not_started", "entering"] });
    expect(r).toMatchObject({ ready: false, notStarted: 1, entering: 1 });
  });

  it("rolls a school's races up into event progress", () => {
    expect(schoolEventProgress(["done", "no_runners"])).toBe("done");
    expect(schoolEventProgress(["not_started", "not_started"])).toBe("not_started");
    expect(schoolEventProgress(["done", "not_started"])).toBe("entering");
    expect(schoolEventProgress([])).toBe("done");
  });
});
