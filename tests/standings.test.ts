import { describe, it, expect } from "vitest";
import {
  computeSeasonStandings,
  type PublishedResultForStandings,
} from "@/lib/standings";

function result(
  runnerId: string,
  position: number
): PublishedResultForStandings {
  return { runnerId, runnerName: runnerId, position };
}

describe("computeSeasonStandings", () => {
  it("excludes runners below minRacesRequired and sums raw positions ascending", () => {
    const rows = [
      result("alice", 1),
      result("alice", 2),
      result("alice", 3),
      result("alice", 4), // 4 races, total 10
      result("bob", 1),
      result("bob", 1), // only 2 races, total 2 but not qualified yet
    ];
    const { qualified, notYetQualified } = computeSeasonStandings(rows, 4);
    expect(qualified.map((r) => r.runnerId)).toEqual(["alice"]);
    expect(qualified[0].total).toBe(10);
    expect(notYetQualified.map((r) => r.runnerId)).toEqual(["bob"]);
  });

  it("lower total wins and sorts qualified runners ascending", () => {
    const rows = [
      ...Array(4).fill(null).map(() => result("alice", 5)), // total 20
      ...Array(4).fill(null).map(() => result("bob", 2)), // total 8
    ];
    const { qualified } = computeSeasonStandings(rows, 4);
    expect(qualified.map((r) => r.runnerId)).toEqual(["bob", "alice"]);
  });

  it("retroactively re-qualifies a runner purely from lowering minRacesRequired, with no new race", () => {
    const rows = [result("alice", 1), result("alice", 2), result("alice", 3)];
    const before = computeSeasonStandings(rows, 4);
    expect(before.qualified).toHaveLength(0);
    expect(before.notYetQualified).toHaveLength(1);

    const after = computeSeasonStandings(rows, 3);
    expect(after.qualified.map((r) => r.runnerId)).toEqual(["alice"]);
    expect(after.notYetQualified).toHaveLength(0);
  });
});
