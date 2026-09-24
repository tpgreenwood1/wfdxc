import { eq, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  events,
  publishedIndividualResults,
  publishedTeamResults,
  races,
  results,
  runners,
  schools,
} from "@/db/schema";
import { computeIndividualResults, computeTeamResults } from "./scoring";
import type { ResultRow } from "./types";

async function fetchRaceWithSeason(raceId: string) {
  const db = getDb();
  const [row] = await db
    .select({
      id: races.id,
      eventId: races.eventId,
      yearGroup: races.yearGroup,
      gender: races.gender,
      status: races.status,
      publishedAt: races.publishedAt,
      publishedResultCount: races.publishedResultCount,
      seasonId: events.seasonId,
    })
    .from(races)
    .innerJoin(events, eq(races.eventId, events.id))
    .where(eq(races.id, raceId));
  return row ?? null;
}

async function fetchLiveResultRows(raceId: string): Promise<ResultRow[]> {
  const db = getDb();
  return db
    .select({
      runnerId: results.runnerId,
      runnerName: runners.name,
      schoolId: results.schoolId,
      schoolName: schools.name,
      position: results.position,
    })
    .from(results)
    .innerJoin(runners, eq(results.runnerId, runners.id))
    .innerJoin(schools, eq(results.schoolId, schools.id))
    .where(eq(results.raceId, raceId));
}

/**
 * Computes individual + team results from the live `results` table and overwrites
 * that race's published snapshot. Used both when a race is first closed and on an
 * explicit admin "republish" after a post-close edit.
 */
export async function publishRace(raceId: string): Promise<void> {
  const db = getDb();
  const race = await fetchRaceWithSeason(raceId);
  if (!race) throw new Error(`Race ${raceId} not found`);

  const rows = await fetchLiveResultRows(raceId);
  const individual = computeIndividualResults(rows);
  const teams = computeTeamResults(rows);
  const publishedAt = new Date();

  await db.transaction(async (tx) => {
    await tx
      .delete(publishedIndividualResults)
      .where(eq(publishedIndividualResults.raceId, raceId));
    await tx
      .delete(publishedTeamResults)
      .where(eq(publishedTeamResults.raceId, raceId));

    if (individual.length > 0) {
      await tx.insert(publishedIndividualResults).values(
        individual.map((r) => ({
          raceId,
          eventId: race.eventId,
          seasonId: race.seasonId,
          yearGroup: race.yearGroup,
          gender: race.gender,
          runnerId: r.runnerId,
          runnerName: r.runnerName,
          schoolId: r.schoolId,
          schoolName: r.schoolName,
          position: r.position,
          publishedAt,
        }))
      );
    }

    if (teams.length > 0) {
      await tx.insert(publishedTeamResults).values(
        teams.map((t) => ({
          raceId,
          eventId: race.eventId,
          seasonId: race.seasonId,
          yearGroup: race.yearGroup,
          gender: race.gender,
          schoolId: t.schoolId,
          schoolName: t.schoolName,
          scoringCount: t.scoringCount,
          scoreSum: t.scoreSum,
          rank: t.rank,
          publishedAt,
        }))
      );
    }

    await tx
      .update(races)
      .set({ publishedAt, publishedResultCount: rows.length })
      .where(eq(races.id, raceId));
  });
}

/**
 * True when a closed race's live results have changed since its last publish —
 * covers edits/additions (updatedAt advances) and deletions (count no longer matches).
 */
export async function isDiverged(raceId: string): Promise<boolean> {
  const db = getDb();
  const [race] = await db
    .select({
      publishedAt: races.publishedAt,
      publishedResultCount: races.publishedResultCount,
    })
    .from(races)
    .where(eq(races.id, raceId));

  if (!race || race.publishedAt === null) return false;

  const [agg] = await db
    .select({
      count: sql<number>`count(*)::int`,
      maxUpdatedAt: sql<string | null>`max(${results.updatedAt})`,
    })
    .from(results)
    .where(eq(results.raceId, raceId));

  const currentCount = agg?.count ?? 0;
  if (currentCount !== race.publishedResultCount) return true;
  if (agg?.maxUpdatedAt && new Date(agg.maxUpdatedAt) > race.publishedAt) {
    return true;
  }
  return false;
}
