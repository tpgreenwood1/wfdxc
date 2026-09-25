import { describe, expect, it } from "vitest";
import {
  applySteps,
  invertSteps,
  parseSteps,
  planCloseGap,
  planInsert,
  planSwap,
  summarizeMove,
  type PositionStep,
} from "@/lib/positionOps";
import type { PositionAck } from "@/lib/raceIssues";

type Row = { id: string; position: number };

function rows(spec: Record<string, number>): Row[] {
  return Object.entries(spec).map(([id, position]) => ({ id, position }));
}

function apply(r: Row[], steps: PositionStep[], acks: PositionAck[] = []) {
  const out = applySteps(r, acks, steps);
  if ("error" in out) throw new Error(out.error);
  return out;
}

function places(r: Row[]) {
  return Object.fromEntries(r.map((x) => [x.id, x.position]));
}

function roundTrip(r: Row[], steps: PositionStep[], acks: PositionAck[] = []) {
  const forward = apply(r, steps, acks);
  const back = apply(forward.rows, invertSteps(r, steps), forward.acks);
  expect(places(back.rows)).toEqual(places(r));
  return forward;
}

describe("planInsert", () => {
  it("just moves when the target place is empty", () => {
    const r = rows({ a: 1, b: 3 });
    expect(places(roundTrip(r, planInsert(r, "b", 2)).rows)).toEqual({ a: 1, b: 2 });
  });

  it("slides the runners in between up the list when moving up", () => {
    const r = rows({ a: 1, b: 2, c: 3, d: 4, e: 5 });
    const out = roundTrip(r, planInsert(r, "d", 2));
    expect(places(out.rows)).toEqual({ a: 1, d: 2, b: 3, c: 4, e: 5 });
  });

  it("slides the runners in between down the list when moving down", () => {
    const r = rows({ a: 1, b: 2, c: 3, d: 4, e: 5 });
    const out = roundTrip(r, planInsert(r, "b", 4));
    expect(places(out.rows)).toEqual({ a: 1, c: 2, d: 3, b: 4, e: 5 });
  });

  it("pushes everyone down when the runner came from a duplicate place", () => {
    const r = rows({ a: 1, b: 2, x: 2, c: 3, d: 4 });
    const out = roundTrip(r, planInsert(r, "x", 3));
    expect(places(out.rows)).toEqual({ a: 1, b: 2, x: 3, c: 4, d: 5 });
  });

  it("keeps a runner first on a duplicate by pushing the others down", () => {
    const r = rows({ a: 1, b: 2, x: 2, c: 3 });
    const out = roundTrip(r, planInsert(r, "x", 2));
    expect(places(out.rows)).toEqual({ a: 1, x: 2, b: 3, c: 4 });
  });

  it("carries accepted ties and gaps along with a shift", () => {
    const r = rows({ a: 1, x: 1, b: 2, c: 4 });
    const acks: PositionAck[] = [{ position: 3, kind: "gap", note: "non-league" }];
    const out = roundTrip(r, planInsert(r, "x", 2), acks);
    expect(places(out.rows)).toEqual({ a: 1, x: 2, b: 3, c: 5 });
    expect(out.acks).toEqual([{ position: 4, kind: "gap", note: "non-league" }]);
  });
});

describe("planSwap", () => {
  it("exchanges two places", () => {
    const r = rows({ a: 1, b: 2, c: 3 });
    expect(places(roundTrip(r, planSwap(r, "a", "c")).rows)).toEqual({ a: 3, b: 2, c: 1 });
  });
});

describe("planCloseGap", () => {
  it("moves everyone after the gap up one", () => {
    const r = rows({ a: 1, b: 3, c: 4 });
    expect(places(roundTrip(r, planCloseGap(2)).rows)).toEqual({ a: 1, b: 2, c: 3 });
  });

  it("refuses to close a place someone is now on", () => {
    const r = rows({ a: 1, x: 2, b: 3 });
    expect(applySteps(r, [], planCloseGap(2))).toHaveProperty("error");
  });
});

describe("applySteps", () => {
  it("refuses a result that no longer exists", () => {
    expect(applySteps(rows({ a: 1 }), [], [{ kind: "set", resultId: "zz", position: 2 }])).toHaveProperty(
      "error"
    );
  });
});

describe("summarizeMove", () => {
  it("counts the other runners moved each way", () => {
    const r = rows({ a: 1, b: 2, c: 3, d: 4 });
    const out = apply(r, planInsert(r, "d", 1));
    expect(summarizeMove(r, out.rows, "d")).toEqual({ up: 0, down: 3 });
  });
});

describe("parseSteps", () => {
  it("accepts valid steps and rejects junk", () => {
    expect(parseSteps([{ kind: "shift", from: 2, to: null, delta: -1 }])).toHaveLength(1);
    expect(parseSteps([{ kind: "set", resultId: "a", position: 0 }])).toBeNull();
    expect(parseSteps([{ kind: "shift", from: 3, to: 2, delta: 1 }])).toBeNull();
    expect(parseSteps([])).toBeNull();
    expect(parseSteps("nope")).toBeNull();
  });
});
