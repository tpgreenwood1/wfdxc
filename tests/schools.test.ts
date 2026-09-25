import { describe, expect, it } from "vitest";
import {
  ACCESS_CODE_ALPHABET,
  ACCESS_CODE_LENGTH,
  generateAccessCode,
  normaliseAccessCode,
  slugify,
  uniqueSlug,
} from "@/lib/schools";
import { pickCurrentEvent } from "@/lib/events";

describe("slugify", () => {
  it("drops apostrophes rather than turning them into dashes", () => {
    expect(slugify("St Mary's C of E Primary")).toBe("st-marys-c-of-e-primary");
  });

  it("collapses punctuation and trims dashes", () => {
    expect(slugify("  Oak Hill (Juniors) & Infants! ")).toBe("oak-hill-juniors-infants");
  });

  it("falls back when nothing usable is left", () => {
    expect(slugify("!!!")).toBe("school");
  });
});

describe("uniqueSlug", () => {
  it("returns the base slug when free", () => {
    expect(uniqueSlug("oak-hill", ["oak-hill-juniors"])).toBe("oak-hill");
  });

  it("adds the first free numeric suffix on collision", () => {
    expect(uniqueSlug("oak-hill", ["oak-hill", "oak-hill-2"])).toBe("oak-hill-3");
  });
});

describe("access codes", () => {
  it("generates codes of the right length from the unambiguous alphabet", () => {
    for (let i = 0; i < 200; i++) {
      const code = generateAccessCode();
      expect(code).toHaveLength(ACCESS_CODE_LENGTH);
      for (const ch of code) expect(ACCESS_CODE_ALPHABET).toContain(ch);
    }
    expect(ACCESS_CODE_ALPHABET).not.toMatch(/[01OIL]/);
  });

  it("normalises what a teacher types", () => {
    expect(normaliseAccessCode(" k7p 4qx ")).toBe("K7P4QX");
  });
});

describe("pickCurrentEvent", () => {
  const events = [
    { id: "a", date: "2026-09-12" },
    { id: "c", date: "2026-11-07" },
    { id: "b", date: "2026-10-03" },
  ];

  it("picks today's event", () => {
    expect(pickCurrentEvent(events, "2026-10-03")?.id).toBe("b");
  });

  it("picks the next upcoming event between meets", () => {
    expect(pickCurrentEvent(events, "2026-10-04")?.id).toBe("c");
  });

  it("falls back to the most recent past event after the season", () => {
    expect(pickCurrentEvent(events, "2027-01-01")?.id).toBe("c");
  });

  it("returns null with no events", () => {
    expect(pickCurrentEvent([], "2026-10-03")).toBeNull();
  });
});
