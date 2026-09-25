import { eq, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { dismissedMergeCandidates, runnerAliases, runners, schools } from "@/db/schema";

const SIMILARITY_THRESHOLD = 0.3;
// word_similarity(query, name) scores how well the query matches *any substring* of
// name, rather than the whole strings against each other — needed because plain
// similarity() scores a short typed prefix against a full name very low (e.g.
// similarity('Jamie Cooper', 'Jam') ~ 0.2) even though it's an obvious match-in-
// progress, which made the search box silently drop names while the user was still
// typing them.
const WORD_SIMILARITY_THRESHOLD = 0.4;
const MERGE_CANDIDATE_THRESHOLD = 0.5;

export type RunnerSearchResult = {
  id: string;
  name: string;
  schoolId: string;
  schoolName: string;
  /** How many runners at this school share this exact name, and this one's position
   * among them by creation order — lets the UI show "Sam Smith (2)" to disambiguate
   * two different kids with an identical name instead of two identical-looking rows. */
  duplicateIndex: number;
  duplicateCount: number;
  isRetired: boolean;
};

/**
 * Fuzzy search across every runner in the league (not just the submitting school) —
 * needed so a teacher can find a mid-season transfer who hasn't been re-homed on the
 * roster yet. Matches on the runner's current name or any recorded alias. Case-folded
 * on both sides since pg_trgm similarity() is case-sensitive by default and would
 * otherwise silently drop correct matches for a differently-cased query.
 *
 * Combines whole-string similarity() (catches a misspelled *full* name, e.g. "Jaime
 * Cooper" for "Jamie Cooper") with word_similarity() (catches a name still being
 * typed, e.g. "Jam" or "Coop" for "Jamie Cooper") — either on its own misses one of
 * those two cases.
 *
 * Retired (graduated) runners are excluded by default since they can no longer be
 * entered into a new result — pass `includeRetired: true` for the admin's "fix an old
 * result" flow, where a retired runner is still a legitimate target.
 */
export async function searchRunners(
  query: string,
  opts: { limit?: number; includeRetired?: boolean } = {}
): Promise<RunnerSearchResult[]> {
  const { limit = 20, includeRetired = false } = opts;
  const q = query.trim();
  if (!q) return [];
  const db = getDb();
  const result = await db.execute<RunnerSearchResult>(sql`
    select r.id as id, r.name as name, r.school_id as "schoolId", s.name as "schoolName",
      (row_number() over (
        partition by r.school_id, lower(r.name) order by r.created_at
      ))::int as "duplicateIndex",
      (count(*) over (partition by r.school_id, lower(r.name)))::int as "duplicateCount",
      (r.retired_at is not null) as "isRetired"
    from runners r
    join schools s on s.id = r.school_id
    left join runner_aliases a on a.runner_id = r.id
    where (
      similarity(lower(r.name), lower(${q})) > ${SIMILARITY_THRESHOLD}
       or word_similarity(lower(${q}), lower(r.name)) > ${WORD_SIMILARITY_THRESHOLD}
       or similarity(lower(a.alias), lower(${q})) > ${SIMILARITY_THRESHOLD}
       or word_similarity(lower(${q}), lower(a.alias)) > ${WORD_SIMILARITY_THRESHOLD}
    )
    and (${includeRetired} or r.retired_at is null)
    group by r.id, r.name, r.school_id, s.name, r.created_at, r.retired_at
    order by greatest(
      similarity(lower(r.name), lower(${q})),
      word_similarity(lower(${q}), lower(r.name)),
      coalesce(max(similarity(lower(a.alias), lower(${q}))), 0),
      coalesce(max(word_similarity(lower(${q}), lower(a.alias))), 0)
    ) desc
    limit ${limit}
  `);
  return result.rows;
}

export async function quickAddRunner(
  schoolId: string,
  name: string
): Promise<{ id: string; name: string; schoolId: string; schoolName: string }> {
  const db = getDb();
  const [row] = await db
    .insert(runners)
    .values({ schoolId, name: name.trim() })
    .returning({ id: runners.id, name: runners.name, schoolId: runners.schoolId });
  const [school] = await db
    .select({ name: schools.name })
    .from(schools)
    .where(eq(schools.id, schoolId));
  return { ...row, schoolName: school?.name ?? "" };
}

export async function renameRunner(
  runnerId: string,
  newName: string
): Promise<void> {
  const db = getDb();
  await db
    .update(runners)
    .set({ name: newName.trim() })
    .where(eq(runners.id, runnerId));
}

/** Reassigns a runner's current/default school (e.g. a mid-season transfer). Only
 * affects where the runner shows up on future rosters/entry pickers — never touches
 * `results.school_id` on past races, which is the historical record of who a runner
 * ran for at the time and must stay as-is (see CLAUDE.md's note on the two school
 * fields). */
export async function moveRunnerToSchool(
  runnerId: string,
  newSchoolId: string
): Promise<void> {
  const db = getDb();
  await db
    .update(runners)
    .set({ schoolId: newSchoolId })
    .where(eq(runners.id, runnerId));
}

/** Soft-deletes a runner who's aged out/graduated: hides them from roster pickers and
 * search by default, but keeps the row (and every past result referencing it) intact.
 * Never a hard delete — `results.runner_id` cascades on delete and would destroy
 * their history, which is exactly what this feature exists to avoid. */
export async function retireRunner(runnerId: string): Promise<void> {
  const db = getDb();
  await db.update(runners).set({ retiredAt: new Date() }).where(eq(runners.id, runnerId));
}

/** Undoes a retirement (e.g. retired by mistake, or the runner returns). */
export async function reactivateRunner(runnerId: string): Promise<void> {
  const db = getDb();
  await db.update(runners).set({ retiredAt: null }).where(eq(runners.id, runnerId));
}

export type MergeCandidate = {
  schoolId: string;
  runnerAId: string;
  runnerAName: string;
  runnerBId: string;
  runnerBName: string;
  similarity: number;
};

/**
 * Same-school near-duplicate name pairs (e.g. "Tom" vs "Thomas"), surfaced proactively
 * so they get caught before standings are published rather than after. Deliberately
 * scoped to one school at a time — cross-school same-name kids are a different person,
 * not a duplicate.
 */
export async function findMergeCandidates(
  schoolId: string
): Promise<MergeCandidate[]> {
  const db = getDb();
  const result = await db.execute<MergeCandidate>(sql`
    select
      r1.school_id as "schoolId",
      r1.id as "runnerAId", r1.name as "runnerAName",
      r2.id as "runnerBId", r2.name as "runnerBName",
      similarity(r1.name, r2.name) as similarity
    from runners r1
    join runners r2
      on r1.school_id = r2.school_id and r1.id < r2.id
    left join dismissed_merge_candidates d
      on d.runner_a_id = r1.id and d.runner_b_id = r2.id
    where r1.school_id = ${schoolId}
      and similarity(r1.name, r2.name) > ${MERGE_CANDIDATE_THRESHOLD}
      and d.id is null
    order by similarity desc
  `);
  return result.rows;
}

/** Marks a merge-candidate pair as reviewed-and-not-a-duplicate (e.g. genuinely two
 * different kids with the same name) so it stops resurfacing in the roster tool. */
export async function dismissMergeCandidate(
  runnerAId: string,
  runnerBId: string
): Promise<void> {
  const db = getDb();
  const [a, b] = runnerAId < runnerBId ? [runnerAId, runnerBId] : [runnerBId, runnerAId];
  await db
    .insert(dismissedMergeCandidates)
    .values({ runnerAId: a, runnerBId: b })
    .onConflictDoNothing();
}

/**
 * Merges `duplicateId` into `canonicalId`: reassigns every results row, records the
 * duplicate's name (and its own prior aliases) for audit trail + future search
 * matching, then deletes the duplicate runner record.
 */
export async function mergeRunners(
  canonicalId: string,
  duplicateId: string
): Promise<void> {
  if (canonicalId === duplicateId) {
    throw new Error("Cannot merge a runner into itself");
  }
  const db = getDb();

  await db.transaction(async (tx) => {
    const [duplicate] = await tx
      .select({ name: runners.name })
      .from(runners)
      .where(eq(runners.id, duplicateId));
    if (!duplicate) throw new Error(`Runner ${duplicateId} not found`);

    const priorAliases = await tx
      .select({ alias: runnerAliases.alias })
      .from(runnerAliases)
      .where(eq(runnerAliases.runnerId, duplicateId));

    // results has UNIQUE(race_id, runner_id), so a plain reassignment can collide if
    // the canonical runner already has a result in the same race as the duplicate
    // (both entered separately for the same kid). Skip those rows rather than fail
    // the whole merge; the scorer resolves the leftover duplicate result manually.
    await tx.execute(sql`
      update results
      set runner_id = ${canonicalId}
      where runner_id = ${duplicateId}
        and race_id not in (
          select race_id from results where runner_id = ${canonicalId}
        )
    `);

    await tx.insert(runnerAliases).values([
      { runnerId: canonicalId, alias: duplicate.name },
      ...priorAliases.map((a) => ({ runnerId: canonicalId, alias: a.alias })),
    ]);

    await tx
      .delete(runnerAliases)
      .where(eq(runnerAliases.runnerId, duplicateId));
    await tx.delete(runners).where(eq(runners.id, duplicateId));
  });
}
