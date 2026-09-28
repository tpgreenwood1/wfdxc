import { and, desc, eq, isNotNull, ne, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { events, publishedIndividualResults, publishedTeamResults, races } from "@/db/schema";
import { summariseEvent, type EventSummary } from "./eventSummary";

/** Reads only the permanent published snapshot — never live results/runners/schools —
 * so it's unaffected by later transfers, merges, or pruning. */
export async function getPublishedRaceResults(raceId: string) {
  const db = getDb();
  const [individual, teams] = await Promise.all([
    db
      .select()
      .from(publishedIndividualResults)
      .where(eq(publishedIndividualResults.raceId, raceId))
      .orderBy(publishedIndividualResults.position),
    db
      .select()
      .from(publishedTeamResults)
      .where(eq(publishedTeamResults.raceId, raceId))
      .orderBy(publishedTeamResults.rank),
  ]);
  return { individual, teams };
}

export type SchoolRaceResult = {
  raceId: string;
  eventId: string;
  eventName: string;
  eventDate: string;
  yearGroup: string;
  gender: string;
  teamRank: number | null;
  teamCount: number;
  runners: { runnerName: string; position: number }[];
};

/**
 * One school's published results for a season, for the teacher "how did we do" view.
 * Like everything public, reads only the published snapshot, and filters on the
 * published school_id (who the runner ran for in that race) — never the runner's
 * current school, so a later transfer can't move old results between schools.
 */
export async function getSchoolSeasonResults(
  schoolId: string,
  seasonId: string
): Promise<SchoolRaceResult[]> {
  const db = getDb();
  const [individual, teams, teamCounts] = await Promise.all([
    db
      .select({
        raceId: publishedIndividualResults.raceId,
        eventId: publishedIndividualResults.eventId,
        eventName: events.name,
        eventDate: events.date,
        yearGroup: publishedIndividualResults.yearGroup,
        gender: publishedIndividualResults.gender,
        runnerName: publishedIndividualResults.runnerName,
        position: publishedIndividualResults.position,
      })
      .from(publishedIndividualResults)
      .innerJoin(events, eq(publishedIndividualResults.eventId, events.id))
      .innerJoin(races, eq(publishedIndividualResults.raceId, races.id))
      .where(
        and(
          eq(publishedIndividualResults.seasonId, seasonId),
          eq(publishedIndividualResults.schoolId, schoolId),
          ne(races.status, "cancelled")
        )
      )
      .orderBy(publishedIndividualResults.position),
    db
      .select({ raceId: publishedTeamResults.raceId, rank: publishedTeamResults.rank })
      .from(publishedTeamResults)
      .where(
        and(
          eq(publishedTeamResults.seasonId, seasonId),
          eq(publishedTeamResults.schoolId, schoolId)
        )
      ),
    db
      .select({
        raceId: publishedTeamResults.raceId,
        count: sql<number>`count(*)::int`,
      })
      .from(publishedTeamResults)
      .where(eq(publishedTeamResults.seasonId, seasonId))
      .groupBy(publishedTeamResults.raceId),
  ]);

  const rankByRace = new Map(teams.map((t) => [t.raceId, t.rank]));
  const countByRace = new Map(teamCounts.map((t) => [t.raceId, t.count]));
  const byRace = new Map<string, SchoolRaceResult>();
  for (const row of individual) {
    let race = byRace.get(row.raceId);
    if (!race) {
      race = {
        raceId: row.raceId,
        eventId: row.eventId,
        eventName: row.eventName,
        eventDate: row.eventDate,
        yearGroup: row.yearGroup,
        gender: row.gender,
        teamRank: rankByRace.get(row.raceId) ?? null,
        teamCount: countByRace.get(row.raceId) ?? 0,
        runners: [],
      };
      byRace.set(row.raceId, race);
    }
    race.runners.push({ runnerName: row.runnerName, position: row.position });
  }
  return [...byRace.values()];
}

/** An event's summary page: headline numbers and every published race's top three.
 * Same rules as the race pages — published snapshot only, cancelled races left out. */
export async function getEventSummary(eventId: string): Promise<EventSummary> {
  const db = getDb();
  const published = and(
    eq(races.eventId, eventId),
    ne(races.status, "cancelled"),
    isNotNull(races.publishedAt)
  );
  const [raceRows, individual, teams] = await Promise.all([
    db
      .select({ raceId: races.id, yearGroup: races.yearGroup, gender: races.gender, status: races.status })
      .from(races)
      .where(published),
    db
      .select({
        raceId: publishedIndividualResults.raceId,
        runnerId: publishedIndividualResults.runnerId,
        runnerName: publishedIndividualResults.runnerName,
        schoolId: publishedIndividualResults.schoolId,
        schoolName: publishedIndividualResults.schoolName,
        position: publishedIndividualResults.position,
      })
      .from(publishedIndividualResults)
      .where(eq(publishedIndividualResults.eventId, eventId)),
    db
      .select({
        raceId: publishedTeamResults.raceId,
        schoolName: publishedTeamResults.schoolName,
        scoringCount: publishedTeamResults.scoringCount,
        rank: publishedTeamResults.rank,
      })
      .from(publishedTeamResults)
      .where(eq(publishedTeamResults.eventId, eventId)),
  ]);

  return summariseEvent(
    raceRows.map((r) => ({
      raceId: r.raceId,
      yearGroup: r.yearGroup,
      gender: r.gender,
      beingCorrected: r.status === "open",
    })),
    individual,
    teams
  );
}

/** Runner and school counts per event, for the one-line subtitle on /results.
 * Counted the same way as summariseEvent (frozen names stand in for pruned ids). */
export async function getEventHeadlineCounts(): Promise<
  Map<string, { runners: number; schools: number }>
> {
  const db = getDb();
  const rows = await db
    .select({
      eventId: publishedIndividualResults.eventId,
      runners: sql<number>`count(distinct coalesce(${publishedIndividualResults.runnerId}::text, 'name:' || ${publishedIndividualResults.runnerName} || '|' || ${publishedIndividualResults.schoolName}))::int`,
      schools: sql<number>`count(distinct coalesce(${publishedIndividualResults.schoolId}::text, 'name:' || ${publishedIndividualResults.schoolName}))::int`,
    })
    .from(publishedIndividualResults)
    .innerJoin(races, eq(publishedIndividualResults.raceId, races.id))
    .where(ne(races.status, "cancelled"))
    .groupBy(publishedIndividualResults.eventId);
  return new Map(rows.map((r) => [r.eventId, { runners: r.runners, schools: r.schools }]));
}

/** The most recent event with any published race — where the home page's results
 * button goes. Null before anything's been published. */
export async function getLatestResultsEventId(): Promise<string | null> {
  const db = getDb();
  const [row] = await db
    .select({ id: events.id })
    .from(events)
    .innerJoin(races, eq(races.eventId, events.id))
    .where(and(ne(races.status, "cancelled"), isNotNull(races.publishedAt)))
    .orderBy(desc(events.date))
    .limit(1);
  return row?.id ?? null;
}
