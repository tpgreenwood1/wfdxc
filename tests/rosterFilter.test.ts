import { describe, expect, it } from "vitest";
import { filterRoster, normalizeName } from "@/lib/rosterFilter";

const roster = [
  { name: "Alice Foster" },
  { name: "Carys Ryan" },
  { name: "Jamie Cooper" },
  { name: "Ryan Jameson" },
  { name: "Sienna Kennedy-Harting" },
  { name: "Zoë O'Neil" },
];
const names = (query: string) => filterRoster(roster, query).map((r) => r.name);

describe("normalizeName", () => {
  it("lowercases, strips accents and splits hyphens", () => {
    expect(normalizeName("  Zoë  Kennedy-Harting ")).toBe("zoe kennedy harting");
  });
  it("drops apostrophes", () => {
    expect(normalizeName("O'Neil")).toBe("oneil");
  });
});

describe("filterRoster", () => {
  it("returns the whole roster in order for an empty query", () => {
    expect(names("")).toEqual(roster.map((r) => r.name));
    expect(names("   ")).toEqual(roster.map((r) => r.name));
  });

  it("matches a prefix of any word, case-insensitively", () => {
    expect(names("coo")).toEqual(["Jamie Cooper"]);
    expect(names("COOPER")).toEqual(["Jamie Cooper"]);
  });

  it("requires every typed word to match", () => {
    expect(names("jam coo")).toEqual(["Jamie Cooper"]);
    expect(names("jam fos")).toEqual([]);
  });

  it("ranks a first-name match ahead of a surname match", () => {
    expect(names("ryan")).toEqual(["Ryan Jameson", "Carys Ryan"]);
    expect(names("jam")).toEqual(["Jamie Cooper", "Ryan Jameson"]);
  });

  it("matches either half of a hyphenated surname", () => {
    expect(names("harting")).toEqual(["Sienna Kennedy-Harting"]);
    expect(names("kennedy-h")).toEqual(["Sienna Kennedy-Harting"]);
  });

  it("ignores accents and apostrophes", () => {
    expect(names("zoe")).toEqual(["Zoë O'Neil"]);
    expect(names("oneil")).toEqual(["Zoë O'Neil"]);
  });

  it("falls back to a substring anywhere in the name", () => {
    expect(names("oste")).toEqual(["Alice Foster"]);
  });
});
