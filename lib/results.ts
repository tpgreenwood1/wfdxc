import { and, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { races, results, runners, schools } from "@/db/schema";

export type RosterRunner = { id: string; name: string };

export async function getSchoolRoster(schoolId: string): Promise<RosterRunner[]> {
  const db = getDb();
  return db
    .select({ id: runners.id, name: runners.name })
    .from(runners)
    .where(eq(runners.schoolId, schoolId));
}

export type SubmittedResult = {
  id: string;
  runnerId: string;
  runnerName: string;
  position: number;
};

export async function getResultsForSchoolInRace(
  raceId: string,
  schoolId: string
): Promise<SubmittedResult[]> {
  const db = getDb();
  return db
    .select({
      id: results.id,
      runnerId: results.runnerId,
      runnerName: runners.name,
      position: results.position,
    })
    .from(results)
    .innerJoin(runners, eq(results.runnerId, runners.id))
    .where(and(eq(results.raceId, raceId), eq(results.schoolId, schoolId)))
    .orderBy(results.position);
}

export async function upsertResult(input: {
  raceId: string;
  runnerId: string;
  schoolId: string;
  position: number;
  submittedBy: string;
}): Promise<void> {
  const db = getDb();
  await db
    .insert(results)
    .values(input)
    .onConflictDoUpdate({
      target: [results.raceId, results.runnerId],
      set: {
        position: input.position,
        schoolId: input.schoolId,
        submittedBy: input.submittedBy,
        updatedAt: new Date(),
      },
    });
}

export async function deleteResult(resultId: string): Promise<void> {
  const db = getDb();
  await db.delete(results).where(eq(results.id, resultId));
}

/** Race ids this school has submitted at least one result for, across every race in
 * the event — used to derive each hub-page row's "not started" / "submitted" status. */
export async function getSubmittedRaceIdsForSchool(
  eventId: string,
  schoolId: string
): Promise<Set<string>> {
  const db = getDb();
  const rows = await db
    .selectDistinct({ raceId: results.raceId })
    .from(results)
    .innerJoin(races, eq(results.raceId, races.id))
    .where(and(eq(races.eventId, eventId), eq(results.schoolId, schoolId)));
  return new Set(rows.map((r) => r.raceId));
}

/** (raceId, schoolId) pairs with at least one submitted result, across the whole
 * event — backs the admin links grid's per-cell submission status. */
export async function getSubmissionStatusMatrix(
  eventId: string
): Promise<Set<string>> {
  const db = getDb();
  const rows = await db
    .selectDistinct({ raceId: results.raceId, schoolId: results.schoolId })
    .from(results)
    .innerJoin(races, eq(results.raceId, races.id))
    .where(eq(races.eventId, eventId));
  return new Set(rows.map((r) => `${r.raceId}:${r.schoolId}`));
}

export type AdminResultRow = {
  id: string;
  runnerId: string;
  runnerName: string;
  schoolId: string;
  schoolName: string;
  position: number;
};

export async function getRaceResultsForAdmin(
  raceId: string
): Promise<AdminResultRow[]> {
  const db = getDb();
  const rows = await db
    .select({
      id: results.id,
      runnerId: results.runnerId,
      runnerName: runners.name,
      schoolId: results.schoolId,
      schoolName: schools.name,
      position: results.position,
    })
    .from(results)
    .innerJoin(runners, eq(results.runnerId, runners.id))
    .innerJoin(schools, eq(results.schoolId, schools.id))
    .where(eq(results.raceId, raceId))
    .orderBy(results.position);
  return rows;
}
