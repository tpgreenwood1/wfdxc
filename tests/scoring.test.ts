import { describe, it, expect } from "vitest";
import { computeIndividualResults, computeTeamResults } from "@/lib/scoring";
import type { ResultRow } from "@/lib/types";

function row(
  runnerId: string,
  schoolId: string,
  position: number,
  schoolName = schoolId
): ResultRow {
  return {
    runnerId,
    runnerName: runnerId,
    schoolId,
    schoolName,
    position,
  };
}

describe("computeIndividualResults", () => {
  it("sorts by position ascending", () => {
    const rows = [row("c", "S1", 3), row("a", "S1", 1), row("b", "S2", 2)];
    const result = computeIndividualResults(rows);
    expect(result.map((r) => r.runnerId)).toEqual(["a", "b", "c"]);
  });

  it("does not mutate the input array", () => {
    const rows = [row("b", "S1", 2), row("a", "S1", 1)];
    const copy = [...rows];
    computeIndividualResults(rows);
    expect(rows).toEqual(copy);
  });
});

describe("computeTeamResults", () => {
  it("ranks a full team of 4 above a smaller team even with a worse scoreSum", () => {
    // School A: 4 finishers summing to 40 (worse sum, but full team).
    // School B: 3 finishers summing to 6 (great sum, but incomplete team).
    const rows = [
      row("a1", "A", 10),
      row("a2", "A", 10),
      row("a3", "A", 10),
      row("a4", "A", 10),
      row("b1", "B", 1),
      row("b2", "B", 2),
      row("b3", "B", 3),
    ];
    const teams = computeTeamResults(rows);
    const a = teams.find((t) => t.schoolId === "A")!;
    const b = teams.find((t) => t.schoolId === "B")!;
    expect(a.scoringCount).toBe(4);
    expect(b.scoringCount).toBe(3);
    expect(a.rank).toBeLessThan(b.rank);
  });

  it("uses scoreSum as a tiebreaker only within equal scoringCount", () => {
    const rows = [
      row("a1", "A", 1),
      row("a2", "A", 2),
      row("a3", "A", 3),
      row("a4", "A", 4),
      row("b1", "B", 5),
      row("b2", "B", 6),
      row("b3", "B", 7),
      row("b4", "B", 8),
    ];
    const teams = computeTeamResults(rows);
    const a = teams.find((t) => t.schoolId === "A")!;
    const b = teams.find((t) => t.schoolId === "B")!;
    expect(a.scoringCount).toBe(4);
    expect(b.scoringCount).toBe(4);
    expect(a.scoreSum).toBeLessThan(b.scoreSum);
    expect(a.rank).toBe(1);
    expect(b.rank).toBe(2);
  });

  it("only counts the first 4 finishers toward scoreSum, ignoring the 5th+", () => {
    const rows = [
      row("a1", "A", 1),
      row("a2", "A", 2),
      row("a3", "A", 3),
      row("a4", "A", 4),
      row("a5", "A", 100),
    ];
    const teams = computeTeamResults(rows);
    const a = teams.find((t) => t.schoolId === "A")!;
    expect(a.scoringCount).toBe(4);
    expect(a.scoreSum).toBe(10);
  });

  it("still fields a ranked team with a single finisher", () => {
    const rows = [row("a1", "A", 5)];
    const teams = computeTeamResults(rows);
    expect(teams).toHaveLength(1);
    expect(teams[0].scoringCount).toBe(1);
    expect(teams[0].rank).toBe(1);
  });

  it("gives equal teams the same rank and skips ranks for the tie (1224 ranking)", () => {
    const rows = [
      row("a1", "A", 1),
      row("a2", "A", 2),
      row("b1", "B", 1),
      row("b2", "B", 2),
      row("c1", "C", 10),
      row("c2", "C", 11),
    ];
    const teams = computeTeamResults(rows);
    const a = teams.find((t) => t.schoolId === "A")!;
    const b = teams.find((t) => t.schoolId === "B")!;
    const c = teams.find((t) => t.schoolId === "C")!;
    expect(a.rank).toBe(1);
    expect(b.rank).toBe(1);
    expect(c.rank).toBe(3);
  });
});
