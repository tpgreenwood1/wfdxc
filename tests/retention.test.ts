import { describe, expect, it } from "vitest";
import { previousSeason, resultsCutoff, type SeasonSpan } from "@/lib/retention";

const season = (name: string, first: string, last: string): SeasonSpan => ({
  id: name,
  name,
  firstEventDate: first,
  lastEventDate: last,
});

const s2024 = season("2024-25", "2024-10-05", "2025-03-15");
const s2025 = season("2025-26", "2025-10-04", "2026-03-14");

describe("previousSeason", () => {
  it("picks the latest finished season before the new one is set up", () => {
    expect(previousSeason([s2024, s2025], "2026-09-01")?.name).toBe("2025-26");
  });

  it("ignores a new season that has future events, even after its first event", () => {
    const s2026 = season("2026-27", "2026-09-20", "2027-03-13");
    expect(previousSeason([s2024, s2025, s2026], "2026-10-01")?.name).toBe("2025-26");
  });

  it("treats an event today as not yet finished", () => {
    expect(previousSeason([s2024, s2025], "2026-03-14")?.name).toBe("2024-25");
  });

  it("returns null when no season has finished", () => {
    expect(previousSeason([season("2026-27", "2026-09-20", "2027-03-13")], "2026-10-01")).toBeNull();
    expect(previousSeason([], "2026-10-01")).toBeNull();
  });
});

describe("resultsCutoff", () => {
  it("is three years before today", () => {
    expect(resultsCutoff("2026-10-01")).toBe("2023-10-01");
  });

  it("rolls 29 February forward in a non-leap year", () => {
    expect(resultsCutoff("2028-02-29")).toBe("2025-03-01");
  });
});
