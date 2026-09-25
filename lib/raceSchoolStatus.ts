import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { races, raceSchoolStatus, results } from "@/db/schema";

export type ConfirmedState = "done" | "no_runners";

/** Where one school is with one race, combining what it has entered with what it has
 * confirmed. 'entering' = has results but hasn't said it's finished. */
export type SchoolRaceState = "done" | "no_runners" | "entering" | "not_started";

export function schoolRaceState(
  entered: number,
  confirmed: ConfirmedState | undefined
): SchoolRaceState {
  if (entered > 0) return confirmed === "done" ? "done" : "entering";
  if (confirmed) return "no_runners"; // "done" with nothing entered means nobody ran
  return "not_started";
}

export type RaceReadiness = {
  ready: boolean;
  notStarted: number;
  entering: number;
  totalEntries: number;
};

/** A race is ready to finalise once it has results, no open issues, and every school
 * has confirmed it — 'done' or 'no runners'. A school still 'entering' blocks too:
 * mid-event nearly every school is part-way through, and bulk-finalising then would
 * close races under teachers who are still typing. The admin can still finalise a
 * single race anyway (with a warning) or mark the school done on its behalf. */
export function raceReadiness(input: {
  openIssues: number;
  totalEntries: number;
  schoolStates: SchoolRaceState[];
}): RaceReadiness {
  const notStarted = input.schoolStates.filter((s) => s === "not_started").length;
  const entering = input.schoolStates.filter((s) => s === "entering").length;
  return {
    ready:
      input.totalEntries > 0 && input.openIssues === 0 && notStarted === 0 && entering === 0,
    notStarted,
    entering,
    totalEntries: input.totalEntries,
  };
}

export type SchoolEventProgress = "done" | "entering" | "not_started";

/** One school across all of an event's still-open races — drives the chase list. */
export function schoolEventProgress(states: SchoolRaceState[]): SchoolEventProgress {
  if (states.length === 0) return "done";
  if (states.every((s) => s === "done" || s === "no_runners")) return "done";
  if (states.every((s) => s === "not_started")) return "not_started";
  return "entering";
}

const key = (raceId: string, schoolId: string) => `${raceId}:${schoolId}`;

/** `${raceId}:${schoolId}` -> confirmed state, for every race in the event. */
export async function getConfirmedStatesForEvent(
  eventId: string
): Promise<Map<string, ConfirmedState>> {
  const db = getDb();
  const rows = await db
    .select({
      raceId: raceSchoolStatus.raceId,
      schoolId: raceSchoolStatus.schoolId,
      state: raceSchoolStatus.state,
    })
    .from(raceSchoolStatus)
    .innerJoin(races, eq(raceSchoolStatus.raceId, races.id))
    .where(eq(races.eventId, eventId));
  return new Map(rows.map((r) => [key(r.raceId, r.schoolId), r.state]));
}

/** schoolId -> confirmed state for one race. */
export async function getConfirmedStatesForRace(
  raceId: string
): Promise<Map<string, ConfirmedState>> {
  const db = getDb();
  const rows = await db
    .select({ schoolId: raceSchoolStatus.schoolId, state: raceSchoolStatus.state })
    .from(raceSchoolStatus)
    .where(eq(raceSchoolStatus.raceId, raceId));
  return new Map(rows.map((r) => [r.schoolId, r.state]));
}

/** Sets (or with `null`, clears) a school's confirmation for one race. */
export async function setConfirmedState(
  raceId: string,
  schoolId: string,
  state: ConfirmedState | null,
  setBy: "teacher" | "admin"
): Promise<void> {
  const db = getDb();
  if (state === null) {
    await db
      .delete(raceSchoolStatus)
      .where(and(eq(raceSchoolStatus.raceId, raceId), eq(raceSchoolStatus.schoolId, schoolId)));
    return;
  }
  await db
    .insert(raceSchoolStatus)
    .values({ raceId, schoolId, state, setBy })
    .onConflictDoUpdate({
      target: [raceSchoolStatus.raceId, raceSchoolStatus.schoolId],
      set: { state, setBy, updatedAt: new Date() },
    });
}

/** "We're done for today": every open race in the event is confirmed — 'done' where
 * the school entered runners, 'no_runners' where it entered none. */
export async function confirmSchoolForEvent(
  eventId: string,
  schoolId: string,
  setBy: "teacher" | "admin"
): Promise<void> {
  const db = getDb();
  const openRaces = await db
    .select({ id: races.id })
    .from(races)
    .where(and(eq(races.eventId, eventId), eq(races.status, "open")));
  if (openRaces.length === 0) return;

  const raceIds = openRaces.map((r) => r.id);
  const entered = await db
    .selectDistinct({ raceId: results.raceId })
    .from(results)
    .where(and(inArray(results.raceId, raceIds), eq(results.schoolId, schoolId)));
  const enteredSet = new Set(entered.map((r) => r.raceId));

  await db
    .insert(raceSchoolStatus)
    .values(
      raceIds.map((raceId) => ({
        raceId,
        schoolId,
        state: (enteredSet.has(raceId) ? "done" : "no_runners") as ConfirmedState,
        setBy,
      }))
    )
    .onConflictDoUpdate({
      target: [raceSchoolStatus.raceId, raceSchoolStatus.schoolId],
      set: { state: sql`excluded.state`, setBy, updatedAt: new Date() },
    });
}
