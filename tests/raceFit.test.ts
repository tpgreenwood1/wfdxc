import { describe, expect, it } from "vitest";
import {
  buildRunnerHints,
  isRaceMismatch,
  needsWarning,
  summariseMismatches,
  type RaceRef,
  type RunnerRaceHistoryRow,
} from "@/lib/raceFit";

const current: RaceRef = {
  raceId: "race-now",
  eventId: "ev-now",
  seasonId: "s2",
  eventDate: "2026-11-01",
  yearGroup: "reception",
  gender: "girls",
};

function row(runnerId: string, overrides: Partial<RunnerRaceHistoryRow>): RunnerRaceHistoryRow {
  return {
    runnerId,
    raceId: "race-x",
    eventId: "ev-old",
    seasonId: "s2",
    eventDate: "2026-10-01",
    eventName: "October XC",
    yearGroup: "reception",
    gender: "girls",
    ...overrides,
  };
}

describe("isRaceMismatch", () => {
  it("flags a different gender", () => {
    expect(isRaceMismatch(current, { ...current, gender: "boys" })).toBe(true);
  });

  it("expects the same year group within a season", () => {
    expect(isRaceMismatch(current, { ...current })).toBe(false);
    expect(isRaceMismatch(current, { ...current, yearGroup: "y4" })).toBe(true);
  });

  it("expects the year group to have gone up in a later season", () => {
    const y2 = { ...current, yearGroup: "y2" };
    expect(isRaceMismatch(y2, { seasonId: "s1", yearGroup: "y1", gender: "girls" })).toBe(false);
    expect(isRaceMismatch(y2, { seasonId: "s1", yearGroup: "y2", gender: "girls" })).toBe(true);
    expect(isRaceMismatch(current, { seasonId: "s1", yearGroup: "y3", gender: "girls" })).toBe(true);
  });
});

describe("buildRunnerHints", () => {
  it("leaves out runners with no history and ignores this race's own results", () => {
    const hints = buildRunnerHints(current, [row("a", { raceId: "race-now", eventId: "ev-now" })]);
    expect(hints).toEqual({});
  });

  it("lists other races at the same event", () => {
    const hints = buildRunnerHints(current, [
      row("a", { raceId: "race-y3g", eventId: "ev-now", eventDate: "2026-11-01", yearGroup: "y3" }),
    ]);
    expect(hints.a.otherRacesToday).toEqual([{ raceId: "race-y3g", label: "Y3 Girls" }]);
    expect(hints.a.lastRan).toBeNull();
    expect(needsWarning(hints.a)).toBe(true);
  });

  it("uses the most recent earlier event and ignores later ones", () => {
    const hints = buildRunnerHints(current, [
      row("a", { eventId: "ev-sep", eventDate: "2026-09-01", eventName: "Sept", yearGroup: "reception" }),
      row("a", { eventId: "ev-oct", eventDate: "2026-10-01", eventName: "Oct", yearGroup: "y4", gender: "boys" }),
      row("a", { eventId: "ev-dec", eventDate: "2026-12-01", eventName: "Dec", yearGroup: "y5" }),
    ]);
    expect(hints.a.lastRan).toEqual({ label: "Y4 Boys", eventName: "Oct" });
    expect(hints.a.lastRanMismatch).toBe(true);
  });

  it("doesn't warn when the last race fits", () => {
    const hints = buildRunnerHints(current, [row("a", {})]);
    expect(hints.a.lastRanMismatch).toBe(false);
    expect(needsWarning(hints.a)).toBe(false);
  });
});

describe("summariseMismatches", () => {
  it("counts the races out-of-place runners point to, most common first", () => {
    const hints = buildRunnerHints(current, [
      row("a", { yearGroup: "y4", gender: "boys" }),
      row("b", { yearGroup: "y4", gender: "boys" }),
      row("c", { yearGroup: "y3" }),
      row("d", {}),
    ]);
    expect(summariseMismatches([hints.a, hints.b, hints.c, hints.d, undefined])).toEqual([
      { label: "Y4 Boys", count: 2 },
      { label: "Y3 Girls", count: 1 },
    ]);
  });
});
