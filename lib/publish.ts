import { and, eq, isNull, sql } from "drizzle-orm";
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
      prunedAt: races.prunedAt,
      seasonId: events.seasonId,
    })
    .from(races)
    .innerJoin(events, eq(races.eventId, events.id))
    .where(eq(races.id, raceId));
  return row ?? null;
}

type Tx = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];

async function fetchLiveResultRows(db: Tx, raceId: string): Promise<ResultRow[]> {
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
  if (race.prunedAt) {
    throw new Error(
      "This race's results are archived (some runners were removed under the data-retention policy), so it can't be republished."
    );
  }

  await db.transaction(async (tx) => {
    // Serialises concurrent publishes of the same race (two "Finalise" clicks, two
    // tabs): without it, the second transaction's delete misses the first's
    // uncommitted rows and both snapshots end up inserted. The live read happens after
    // the lock so the snapshot reflects every result committed before it.
    await tx.select({ id: races.id }).from(races).where(eq(races.id, raceId)).for("update");
    const rows = await fetchLiveResultRows(tx, raceId);
    const individual = computeIndividualResults(rows);
    const teams = computeTeamResults(rows);
    const publishedAt = new Date();

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
 * Admin edits to a closed (finalised) race go straight to the public page and
 * standings — the admin is deliberately correcting it, so there's no separate
 * "republish" step to forget. No-op for open/cancelled races.
 */
export async function republishIfClosed(raceId: string): Promise<boolean> {
  const db = getDb();
  const [race] = await db
    .select({ status: races.status, prunedAt: races.prunedAt })
    .from(races)
    .where(eq(races.id, raceId));
  if (race?.status !== "closed" || race.prunedAt) return false;
  await publishRace(raceId);
  return true;
}

/** Republishes every closed race a runner has a live result in — after a rename or
 * merge, so the frozen runner_name in published rows picks up the correction. Pruned
 * races are skipped (their snapshot is final), so they keep the old name. */
export async function republishClosedRacesForRunner(runnerId: string): Promise<string[]> {
  const db = getDb();
  const rows = await db
    .selectDistinct({ raceId: results.raceId })
    .from(results)
    .innerJoin(races, eq(results.raceId, races.id))
    .where(
      and(eq(results.runnerId, runnerId), eq(races.status, "closed"), isNull(races.prunedAt))
    );
  for (const { raceId } of rows) await publishRace(raceId);
  return rows.map((r) => r.raceId);
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
