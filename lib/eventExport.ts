import { and, eq, inArray, ne } from "drizzle-orm";
import { getDb } from "@/db/client";
import { events, races, results, runners, schools } from "@/db/schema";
import { isUuid } from "./ids";
import { raceLabel, sortRaces } from "./raceLabels";
import { computeIndividualResults, computeTeamResults } from "./scoring";
import type { ResultRow, TeamResult } from "./types";

export type ExportRace = {
  id: string;
  label: string;
  status: "open" | "closed" | "cancelled";
  individual: ResultRow[];
  teams: TeamResult[];
};

export type EventExport = {
  event: typeof events.$inferSelect;
  races: ExportRace[];
};

/**
 * An event's results for printing / CSV, computed from the *live* results so it works
 * before races are finalised too — the paper fallback if the site is struggling, and
 * the sheet to read out at the event. Finalised races come out identical to their
 * published snapshot (same scoring code); open ones are marked provisional by callers.
 * Cancelled races are left out.
 */
export async function getEventExport(
  eventId: string,
  onlyRaceId?: string
): Promise<EventExport | null> {
  if (!isUuid(eventId)) return null;
  const db = getDb();
  const [event] = await db.select().from(events).where(eq(events.id, eventId));
  if (!event) return null;

  const eventRaces = sortRaces(
    await db
      .select({ id: races.id, yearGroup: races.yearGroup, gender: races.gender, status: races.status })
      .from(races)
      .where(
        and(
          eq(races.eventId, eventId),
          ne(races.status, "cancelled"),
          ...(onlyRaceId && isUuid(onlyRaceId) ? [eq(races.id, onlyRaceId)] : [])
        )
      )
  );
  if (eventRaces.length === 0) return { event, races: [] };

  const rows = await db
    .select({
      raceId: results.raceId,
      runnerId: results.runnerId,
      runnerName: runners.name,
      schoolId: results.schoolId,
      schoolName: schools.name,
      position: results.position,
    })
    .from(results)
    .innerJoin(runners, eq(results.runnerId, runners.id))
    .innerJoin(schools, eq(results.schoolId, schools.id))
    .where(
      inArray(
        results.raceId,
        eventRaces.map((r) => r.id)
      )
    );

  const byRace = new Map<string, ResultRow[]>();
  for (const { raceId, ...row } of rows) {
    const list = byRace.get(raceId) ?? [];
    list.push(row);
    byRace.set(raceId, list);
  }

  return {
    event,
    races: eventRaces.map((race) => {
      const raceRows = byRace.get(race.id) ?? [];
      return {
        id: race.id,
        label: raceLabel(race),
        status: race.status,
        individual: computeIndividualResults(raceRows),
        teams: computeTeamResults(raceRows),
      };
    }),
  };
}

/** "=5" when a place is shared (accepted tie / equal team score), else "5". */
export function sharedLabel(values: number[]): (v: number) => string {
  const counts = new Map<number, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return (v) => ((counts.get(v) ?? 0) > 1 ? `=${v}` : String(v));
}
