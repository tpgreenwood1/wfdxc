import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { events, races, results, schools } from "@/db/schema";
import { getPositionAcksForEvent, raceLabel, sortRaces } from "./races";
import { findRaceIssues, type RaceIssues } from "./raceIssues";
import {
  getConfirmedStatesForEvent,
  raceReadiness,
  schoolEventProgress,
  schoolRaceState,
  type RaceReadiness,
  type SchoolEventProgress,
  type SchoolRaceState,
} from "./raceSchoolStatus";

type Race = typeof races.$inferSelect;
type School = typeof schools.$inferSelect;

export type BoardRace = Race & {
  label: string;
  entries: number;
  issues: RaceIssues;
  readiness: RaceReadiness;
  stateCounts: Record<SchoolRaceState, number>;
};

export type BoardSchool = School & {
  progress: SchoolEventProgress;
  racesEntered: number;
  /** Open races this school hasn't entered or confirmed — what to chase them for. */
  outstanding: { raceId: string; label: string }[];
};

export type EventBoard = {
  event: typeof events.$inferSelect;
  races: BoardRace[];
  schools: BoardSchool[];
  summary: {
    finalised: number;
    cancelled: number;
    total: number;
    openIssues: number;
    readyToFinalise: number;
    schoolsNotDone: number;
  };
};

/**
 * Everything the race-day views need about one event in a handful of queries: per
 * race — entries, duplicate/missing places, which schools are done — and per school,
 * which open races they still owe. Used by the event board, the Today dashboard and
 * the "finalise all ready races" action so they all agree on what "ready" means.
 */
export async function getEventBoard(eventId: string): Promise<EventBoard | null> {
  const db = getDb();
  const [event] = await db.select().from(events).where(eq(events.id, eventId));
  if (!event) return null;

  const [eventRaces, allSchools, resultRows, acksByRace, confirmed] = await Promise.all([
    db.select().from(races).where(eq(races.eventId, eventId)),
    db.select().from(schools).orderBy(schools.name),
    db
      .select({
        id: results.id,
        raceId: results.raceId,
        schoolId: results.schoolId,
        position: results.position,
      })
      .from(results)
      .innerJoin(races, eq(results.raceId, races.id))
      .where(eq(races.eventId, eventId)),
    getPositionAcksForEvent(eventId),
    getConfirmedStatesForEvent(eventId),
  ]);
  sortRaces(eventRaces);

  const rowsByRace = new Map<string, typeof resultRows>();
  const entryCount = new Map<string, number>();
  for (const r of resultRows) {
    const list = rowsByRace.get(r.raceId) ?? [];
    list.push(r);
    rowsByRace.set(r.raceId, list);
    const k = `${r.raceId}:${r.schoolId}`;
    entryCount.set(k, (entryCount.get(k) ?? 0) + 1);
  }

  const stateOf = (raceId: string, schoolId: string) => {
    const k = `${raceId}:${schoolId}`;
    return schoolRaceState(entryCount.get(k) ?? 0, confirmed.get(k));
  };

  const boardRaces: BoardRace[] = eventRaces.map((race) => {
    const rows = rowsByRace.get(race.id) ?? [];
    const issues = findRaceIssues(rows, acksByRace.get(race.id) ?? []);
    const states = allSchools.map((s) => stateOf(race.id, s.id));
    const stateCounts: Record<SchoolRaceState, number> = {
      done: 0,
      no_runners: 0,
      entering: 0,
      not_started: 0,
    };
    for (const s of states) stateCounts[s] += 1;
    return {
      ...race,
      label: raceLabel(race),
      entries: rows.length,
      issues,
      readiness: raceReadiness({
        openIssues: issues.openCount,
        totalEntries: rows.length,
        schoolStates: states,
      }),
      stateCounts,
    };
  });

  const openRaces = boardRaces.filter((r) => r.status === "open");
  const boardSchools: BoardSchool[] = allSchools.map((school) => {
    const states = openRaces.map((r) => ({ race: r, state: stateOf(r.id, school.id) }));
    return {
      ...school,
      progress: schoolEventProgress(states.map((s) => s.state)),
      racesEntered: boardRaces.filter((r) => (entryCount.get(`${r.id}:${school.id}`) ?? 0) > 0)
        .length,
      outstanding: states
        .filter((s) => s.state === "not_started")
        .map((s) => ({ raceId: s.race.id, label: s.race.label })),
    };
  });

  return {
    event,
    races: boardRaces,
    schools: boardSchools,
    summary: {
      finalised: boardRaces.filter((r) => r.status === "closed").length,
      cancelled: boardRaces.filter((r) => r.status === "cancelled").length,
      total: boardRaces.length,
      openIssues: boardRaces
        .filter((r) => r.status !== "cancelled")
        .reduce((n, r) => n + r.issues.openCount, 0),
      readyToFinalise: openRaces.filter((r) => r.readiness.ready).length,
      schoolsNotDone: boardSchools.filter((s) => s.progress !== "done").length,
    },
  };
}
