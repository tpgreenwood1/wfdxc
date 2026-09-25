import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { races, raceSchoolStatus, results, runners, schools } from "@/db/schema";
import { quickAddRunner } from "./runners";
import { isValidPosition, MAX_POSITION } from "./raceIssues";

export type RosterRunner = {
  id: string;
  name: string;
  duplicateIndex: number;
  duplicateCount: number;
  isRetired: boolean;
};

/** Retired (graduated) runners are excluded by default — they're no longer eligible
 * to race, so entry-time pickers (submit form, hub pre-add) shouldn't offer them. Pass
 * `includeRetired: true` for the admin roster tool, which needs to see and reactivate
 * them. */
export async function getSchoolRoster(
  schoolId: string,
  opts: { includeRetired?: boolean } = {}
): Promise<RosterRunner[]> {
  const { includeRetired = false } = opts;
  const db = getDb();
  const result = await db.execute<RosterRunner>(sql`
    select
      r.id as id, r.name as name,
      (row_number() over (partition by lower(r.name) order by r.created_at))::int as "duplicateIndex",
      (count(*) over (partition by lower(r.name)))::int as "duplicateCount",
      (r.retired_at is not null) as "isRetired"
    from runners r
    where r.school_id = ${schoolId}
      and (${includeRetired} or r.retired_at is null)
    order by r.name
  `);
  return result.rows;
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
}): Promise<{ id: string }> {
  const db = getDb();
  const [row] = await db
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
    })
    .returning({ id: results.id });
  return row;
}

/** Admin-only: unscoped delete of any result. Teacher-facing paths must use
 * deleteResultForSchool instead. */
export async function deleteResult(resultId: string): Promise<void> {
  const db = getDb();
  await db.delete(results).where(eq(results.id, resultId));
}

/** Scoped to (race, school) so a teacher can only ever delete their own school's
 * result in the race they're editing — the result id alone comes from the client and
 * can't be trusted. */
export async function deleteResultForSchool(
  resultId: string,
  raceId: string,
  schoolId: string
): Promise<void> {
  const db = getDb();
  await db
    .delete(results)
    .where(
      and(
        eq(results.id, resultId),
        eq(results.raceId, raceId),
        eq(results.schoolId, schoolId)
      )
    );
}

export type SaveResultRow = {
  runnerId: string | null;
  newRunnerName?: string;
  position: number;
};

export { isValidPosition } from "./raceIssues";

/** The teacher-entry save path, shared by the per-race token form and the school home
 * page. Saves one row at a time (the form autosaves each runner as their position is
 * typed): quick-adds a brand-new runner onto this school's roster if needed, then
 * upserts with results.school_id = the submitting school (the historical record). */
export async function saveSchoolResult(input: {
  raceId: string;
  schoolId: string;
  schoolName: string;
  row: SaveResultRow;
}): Promise<SubmittedResult> {
  const { row } = input;
  if (!isValidPosition(row.position)) {
    throw new Error(`Position must be a whole number from 1 to ${MAX_POSITION}.`);
  }

  const db = getDb();
  let runnerId: string;
  let runnerName: string;
  if (row.runnerId) {
    const [runner] = await db
      .select({ name: runners.name })
      .from(runners)
      .where(eq(runners.id, row.runnerId));
    if (!runner) throw new Error("That runner no longer exists — refresh the page.");
    runnerId = row.runnerId;
    runnerName = runner.name;

    // The (race, runner) upsert below would silently move another school's result
    // (and its place) over to this school — e.g. a teacher picking the wrong child
    // via "Search other schools". Only the scorer can reassign a result.
    const [taken] = await db
      .select({ schoolName: schools.name })
      .from(results)
      .innerJoin(schools, eq(results.schoolId, schools.id))
      .where(
        and(
          eq(results.raceId, input.raceId),
          eq(results.runnerId, runnerId),
          ne(results.schoolId, input.schoolId)
        )
      );
    if (taken) {
      throw new Error(
        `${runner.name} has already been entered in this race by ${taken.schoolName}. Check you've picked the right child, or ask the scorer to move them.`
      );
    }
  } else {
    if (!row.newRunnerName?.trim()) throw new Error("Pick a runner first.");
    const created = await quickAddRunner(input.schoolId, row.newRunnerName);
    runnerId = created.id;
    runnerName = created.name;
  }

  const [saved] = await Promise.all([
    upsertResult({
      raceId: input.raceId,
      runnerId,
      schoolId: input.schoolId,
      position: row.position,
      submittedBy: input.schoolName,
    }),
    // A school that said "no runners" and then enters one clearly did have runners.
    db
      .delete(raceSchoolStatus)
      .where(
        and(
          eq(raceSchoolStatus.raceId, input.raceId),
          eq(raceSchoolStatus.schoolId, input.schoolId),
          eq(raceSchoolStatus.state, "no_runners")
        )
      ),
  ]);

  return { id: saved.id, runnerId, runnerName, position: row.position };
}

/** How many runners this school has entered in each race of the event — drives the
 * school home page's "✓ 6 entered" race buttons. Races with none are absent. */
export async function getEntryCountsForSchool(
  eventId: string,
  schoolId: string
): Promise<Map<string, number>> {
  const db = getDb();
  const rows = await db
    .select({ raceId: results.raceId, count: sql<number>`count(*)::int` })
    .from(results)
    .innerJoin(races, eq(results.raceId, races.id))
    .where(and(eq(races.eventId, eventId), eq(results.schoolId, schoolId)))
    .groupBy(results.raceId);
  return new Map(rows.map((r) => [r.raceId, r.count]));
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

/** `${raceId}:${schoolId}` -> number of results entered, across the whole event —
 * backs the admin race board and chase list. Cells with none are absent. */
export async function getEntryCountMatrix(eventId: string): Promise<Map<string, number>> {
  const db = getDb();
  const rows = await db
    .select({
      raceId: results.raceId,
      schoolId: results.schoolId,
      count: sql<number>`count(*)::int`,
    })
    .from(results)
    .innerJoin(races, eq(results.raceId, races.id))
    .where(eq(races.eventId, eventId))
    .groupBy(results.raceId, results.schoolId);
  return new Map(rows.map((r) => [`${r.raceId}:${r.schoolId}`, r.count]));
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

/**
 * Moves every result one school entered in a race over to another race in the same
 * event — for results typed into the wrong race (e.g. Y3 Girls entered on the Y3
 * Boys page). All or nothing, in one transaction. Refuses if any of those runners
 * already has a result in the target race.
 *
 * The school's confirmation in the source race is cleared (it has nothing there now,
 * so the scorer/teacher should confirm "no runners" rather than it being assumed), and
 * a "no runners" in the target race is cleared since it clearly did have runners.
 * Returns how many results moved; the caller republishes either race if finalised.
 */
export async function moveSchoolEntries(input: {
  fromRaceId: string;
  toRaceId: string;
  schoolId: string;
}): Promise<{ moved: number }> {
  const { fromRaceId, toRaceId, schoolId } = input;
  if (fromRaceId === toRaceId) throw new Error("Pick a different race to move them to.");
  const db = getDb();

  return db.transaction(async (tx) => {
    const raceRows = await tx
      .select({ id: races.id, eventId: races.eventId, status: races.status })
      .from(races)
      .where(inArray(races.id, [fromRaceId, toRaceId]));
    const from = raceRows.find((r) => r.id === fromRaceId);
    const to = raceRows.find((r) => r.id === toRaceId);
    if (!from || !to) throw new Error("Race not found.");
    if (from.eventId !== to.eventId) throw new Error("Can only move results within the same event.");
    if (to.status === "cancelled") throw new Error("That race is cancelled — un-cancel it first.");

    const moving = await tx
      .select({ id: results.id, runnerId: results.runnerId })
      .from(results)
      .where(and(eq(results.raceId, fromRaceId), eq(results.schoolId, schoolId)))
      .for("update");
    if (moving.length === 0) throw new Error("That school has no results in this race.");

    const clashes = await tx
      .select({ name: runners.name })
      .from(results)
      .innerJoin(runners, eq(results.runnerId, runners.id))
      .where(
        and(
          eq(results.raceId, toRaceId),
          inArray(
            results.runnerId,
            moving.map((m) => m.runnerId)
          )
        )
      );
    if (clashes.length > 0) {
      throw new Error(
        `Already in the other race: ${clashes.map((c) => c.name).join(", ")}. Delete those results from one race first.`
      );
    }

    await tx
      .update(results)
      .set({ raceId: toRaceId, updatedAt: new Date() })
      .where(
        inArray(
          results.id,
          moving.map((m) => m.id)
        )
      );
    await tx
      .delete(raceSchoolStatus)
      .where(and(eq(raceSchoolStatus.raceId, fromRaceId), eq(raceSchoolStatus.schoolId, schoolId)));
    await tx
      .delete(raceSchoolStatus)
      .where(
        and(
          eq(raceSchoolStatus.raceId, toRaceId),
          eq(raceSchoolStatus.schoolId, schoolId),
          eq(raceSchoolStatus.state, "no_runners")
        )
      );
    return { moved: moving.length };
  });
}
