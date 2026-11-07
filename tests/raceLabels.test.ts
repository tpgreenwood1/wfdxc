import { describe, expect, it } from "vitest";
import { raceLabel, sortRaces } from "@/lib/raceLabels";

describe("sortRaces", () => {
  it("orders by year group, girls before boys", () => {
    const races = [
      { yearGroup: "y1", gender: "boys" },
      { yearGroup: "reception", gender: "boys" },
      { yearGroup: "y1", gender: "girls" },
      { yearGroup: "reception", gender: "girls" },
    ];
    expect(sortRaces(races).map(raceLabel)).toEqual([
      "Reception Girls",
      "Reception Boys",
      "Y1 Girls",
      "Y1 Boys",
    ]);
  });
});
