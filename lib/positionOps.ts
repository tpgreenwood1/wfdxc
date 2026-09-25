/**
 * Moving runners around a race's finishing order. Pure, so the admin race table
 * applies exactly the same change optimistically that the server then applies in
 * one transaction (`applyPositionSteps` in races.ts), and every change can be
 * undone by running its inverse.
 *
 * A change is a list of primitive steps:
 * - `set`: put one result at a place.
 * - `shift`: move every result (and every accepted tie/gap) in a range of places
 *   up or down by one, optionally leaving one result out (the runner being moved).
 *   A shift refuses to land runners on a place that's still occupied, so a
 *   close-up or undo can't silently merge runners into a tie if someone else
 *   changed the results in the meantime.
 */

import { isValidPosition, MAX_POSITION, type PositionAck } from "./raceIssues";

export type PositionStep =
  | { kind: "set"; resultId: string; position: number }
  | {
      kind: "shift";
      from: number;
      /** Inclusive; null = to the end of the field. */
      to: number | null;
      delta: 1 | -1;
      exclude?: string | null;
    };

type Placed = { id: string; position: number };

const STALE = "The results changed while you were editing — check the list and try again.";

function inRange(position: number, step: { from: number; to: number | null }) {
  return position >= step.from && (step.to === null || position <= step.to);
}

/** The place a shift moves runners onto that wasn't in its range before. */
function receivingPlace(step: Extract<PositionStep, { kind: "shift" }>): number | null {
  if (step.delta < 0) return step.from - 1;
  return step.to === null ? null : step.to + 1;
}

export function applySteps<R extends Placed, A extends PositionAck>(
  rows: R[],
  acks: A[],
  steps: PositionStep[]
): { rows: R[]; acks: A[] } | { error: string } {
  let r = rows;
  let a = acks;
  for (const step of steps) {
    if (step.kind === "set") {
      if (!isValidPosition(step.position)) {
        return { error: `Place must be a whole number from 1 to ${MAX_POSITION}.` };
      }
      if (!r.some((x) => x.id === step.resultId)) return { error: STALE };
      r = r.map((x) => (x.id === step.resultId ? { ...x, position: step.position } : x));
      continue;
    }

    const edge = receivingPlace(step);
    if (edge !== null) {
      if (edge < 1) return { error: "Nobody can move above 1st." };
      if (r.some((x) => x.position === edge && x.id !== step.exclude)) return { error: STALE };
      // Any leftover ack on the receiving place is stale (nothing was flagged there).
      a = a.filter((k) => k.position !== edge);
    }
    r = r.map((x) =>
      x.id !== step.exclude && inRange(x.position, step)
        ? { ...x, position: x.position + step.delta }
        : x
    );
    // Accepted ties/gaps travel with the places they describe.
    a = a.map((k) => (inRange(k.position, step) ? { ...k, position: k.position + step.delta } : k));
  }
  return { rows: r, acks: a };
}

/** Steps that undo `steps`, given the rows as they were before them. */
export function invertSteps(rows: Placed[], steps: PositionStep[]): PositionStep[] {
  const inverse: PositionStep[] = [];
  let current = rows;
  for (const step of steps) {
    if (step.kind === "set") {
      const prev = current.find((x) => x.id === step.resultId)?.position;
      if (prev !== undefined) inverse.unshift({ kind: "set", resultId: step.resultId, position: prev });
    } else {
      inverse.unshift({
        kind: "shift",
        from: step.from + step.delta,
        to: step.to === null ? null : step.to + step.delta,
        delta: step.delta === 1 ? -1 : 1,
        exclude: step.exclude ?? null,
      });
    }
    const out = applySteps(current, [], [step]);
    if ("error" in out) break;
    current = out.rows;
  }
  return inverse;
}

export function planMove(resultId: string, to: number): PositionStep[] {
  return [{ kind: "set", resultId, position: to }];
}

export function planSwap(rows: Placed[], aId: string, bId: string): PositionStep[] {
  const a = rows.find((r) => r.id === aId);
  const b = rows.find((r) => r.id === bId);
  if (!a || !b) return [];
  return [
    { kind: "set", resultId: a.id, position: b.position },
    { kind: "set", resultId: b.id, position: a.position },
  ];
}

/**
 * Put a runner at `to` without creating a tie. If the runner was alone on their
 * old place, the runners in between slide one place to fill it (like reordering a
 * list). If they shared it (a duplicate), everyone from `to` onwards moves down one.
 */
export function planInsert(rows: Placed[], resultId: string, to: number): PositionStep[] {
  const me = rows.find((r) => r.id === resultId);
  if (!me) return [];
  const set: PositionStep = { kind: "set", resultId, position: to };
  if (!rows.some((r) => r.id !== resultId && r.position === to)) return [set];

  const aloneAtOrigin = !rows.some((r) => r.id !== resultId && r.position === me.position);
  if (aloneAtOrigin && me.position > to) {
    return [{ kind: "shift", from: to, to: me.position - 1, delta: 1, exclude: resultId }, set];
  }
  if (aloneAtOrigin && me.position < to) {
    return [{ kind: "shift", from: me.position + 1, to, delta: -1, exclude: resultId }, set];
  }
  return [{ kind: "shift", from: to, to: null, delta: 1, exclude: resultId }, set];
}

/** Remove an empty place: everyone after it moves up one. */
export function planCloseGap(position: number): PositionStep[] {
  return [{ kind: "shift", from: position + 1, to: null, delta: -1 }];
}

/** How many other runners a change moves up / down — for button captions and the undo bar. */
export function summarizeMove(
  before: Placed[],
  after: Placed[],
  exceptId?: string
): { up: number; down: number } {
  const was = new Map(before.map((r) => [r.id, r.position]));
  let up = 0;
  let down = 0;
  for (const r of after) {
    const prev = was.get(r.id);
    if (r.id === exceptId || prev === undefined || prev === r.position) continue;
    if (r.position < prev) up++;
    else down++;
  }
  return { up, down };
}

/** Validates steps arriving at a server action from the client. */
export function parseSteps(raw: unknown): PositionStep[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 10) return null;
  const isPlace = (n: unknown) => typeof n === "number" && isValidPosition(n);
  const steps: PositionStep[] = [];
  for (const s of raw) {
    if (!s || typeof s !== "object") return null;
    const o = s as Record<string, unknown>;
    if (o.kind === "set" && typeof o.resultId === "string" && isPlace(o.position)) {
      steps.push({ kind: "set", resultId: o.resultId, position: o.position as number });
    } else if (
      o.kind === "shift" &&
      isPlace(o.from) &&
      (o.to === null || (isPlace(o.to) && (o.to as number) >= (o.from as number))) &&
      (o.delta === 1 || o.delta === -1) &&
      (o.exclude === undefined || o.exclude === null || typeof o.exclude === "string")
    ) {
      steps.push({
        kind: "shift",
        from: o.from as number,
        to: o.to as number | null,
        delta: o.delta,
        exclude: (o.exclude as string | null | undefined) ?? null,
      });
    } else {
      return null;
    }
  }
  return steps;
}
