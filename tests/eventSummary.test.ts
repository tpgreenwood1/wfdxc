import { describe, expect, it } from "vitest";
import {
  ordinal,
  shortName,
  summariseEvent,
  type SummaryIndividualRow,
  type SummaryRace,
  type SummaryTeamRow,
} from "@/lib/eventSummary";

const race = (raceId: string, yearGroup = "y3", gender = "boys"): SummaryRace => ({
  raceId,
  yearGroup,
  gender,
  beingCorrected: false,
});

let nextId = 0;
const runner = (
  raceId: string,
  position: number,
  schoolName = "Ashlands",
  runnerName = `Runner${position} Surname`
): SummaryIndividualRow => ({
  raceId,
  runnerId: `r${++nextId}`,
  runnerName,
  schoolId: `s-${schoolName}`,
  schoolName,
  position,
});

const team = (raceId: string, rank: number, schoolName: string, scoringCount = 4): SummaryTeamRow => ({
  raceId,
  rank,
  schoolName,
  scoringCount,
});

const podium = (rows: SummaryIndividualRow[]) =>
  summariseEvent([race("a")], rows, []).races[0].individual.map((p) =>
    p.unknown ? `${p.place}:?` : `${p.tied ? "=" : ""}${p.place}:${p.name}`
  );

describe("shortName", () => {
  it("keeps the first name and the last name's initial", () => {
    expect(shortName("Alexander Smith")).toBe("Alexander S.");
    expect(shortName("  Mary  Jane   o'brien ")).toBe("Mary O.");
  });

  it("leaves a single name alone", () => {
    expect(shortName("Wren")).toBe("Wren");
  });
});

describe("ordinal", () => {
  it.each([
    [1, "1st"],
    [2, "2nd"],
    [3, "3rd"],
    [4, "4th"],
    [11, "11th"],
    [12, "12th"],
    [13, "13th"],
    [21, "21st"],
  ])("%i → %s", (n, expected) => expect(ordinal(n)).toBe(expected));
});

describe("individual podium", () => {
  it("shows the top three places with short names", () => {
    expect(
      podium([
        runner("a", 3, "Ashlands", "Cara Jones"),
        runner("a", 1, "Ashlands", "Ava Brown"),
        runner("a", 2, "Ashlands", "Bea Green"),
        runner("a", 4),
      ])
    ).toEqual(["1:Ava B.", "2:Bea G.", "3:Cara J."]);
  });

  it("shows an Unknown runner where a non-league runner took the place (Y6 Boys: 1, 2, 4)", () => {
    expect(podium([runner("a", 1, "A", "Hugo X"), runner("a", 2, "A", "Alex Y"), runner("a", 4)])).toEqual([
      "1:Hugo X.",
      "2:Alex Y.",
      "3:?",
    ]);
  });

  it("shows both runners on a shared place, and no Unknown runner for the place the tie skipped", () => {
    expect(
      podium([runner("a", 1, "A", "Ann A"), runner("a", 1, "B", "Bob B"), runner("a", 3, "A", "Cat C")])
    ).toEqual(["=1:Ann A.", "=1:Bob B.", "3:Cat C."]);
  });

  it("doesn't invent places in a race with fewer than three runners", () => {
    expect(podium([runner("a", 1, "A", "Solo Runner")])).toEqual(["1:Solo R."]);
  });
});

describe("team podium", () => {
  it("shows shared places and flags teams smaller than 4", () => {
    const summary = summariseEvent(
      [race("a")],
      [],
      [
        team("a", 4, "Moorfield"),
        team("a", 3, "Burley Oaks"),
        team("a", 3, "All Saints"),
        team("a", 1, "Ben Rhydding"),
        team("a", 2, "Ashlands", 3),
      ]
    );
    expect(summary.races[0].teams).toEqual([
      { place: 1, tied: false, schoolName: "Ben Rhydding", runners: null },
      { place: 2, tied: false, schoolName: "Ashlands", runners: 3 },
      { place: 3, tied: true, schoolName: "All Saints", runners: null },
      { place: 3, tied: true, schoolName: "Burley Oaks", runners: null },
    ]);
  });
});

describe("event totals", () => {
  it("counts each runner and school once and orders races Reception → Y6, boys first", () => {
    const races = [race("y1g", "y1", "girls"), race("recb", "reception", "boys"), race("y1b", "y1", "boys")];
    const rows = [
      runner("y1g", 1, "Ashlands"),
      runner("y1g", 2, "Menston"),
      runner("recb", 1, "Ashlands"),
      runner("y1b", 1, "Ashlands"),
      // A pruned runner/school still counts, by its frozen names.
      { ...runner("y1b", 2, "Old School"), runnerId: null, schoolId: null },
    ];
    const summary = summariseEvent(races, rows, []);

    expect(summary.runnerCount).toBe(5);
    expect(summary.schoolCount).toBe(3);
    expect(summary.raceCount).toBe(3);
    expect(summary.runnersBySchool).toEqual([
      { schoolName: "Ashlands", runners: 3 },
      { schoolName: "Menston", runners: 1 },
      { schoolName: "Old School", runners: 1 },
    ]);
    expect(summary.races.map((r) => [r.raceId, r.runnerCount])).toEqual([
      ["recb", 1],
      ["y1b", 2],
      ["y1g", 2],
    ]);
  });

  it("ignores rows from races that aren't in the published list", () => {
    const summary = summariseEvent([race("a")], [runner("a", 1), runner("cancelled", 1)], []);
    expect(summary.runnerCount).toBe(1);
  });
});
