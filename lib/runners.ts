import { eq, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { runnerAliases, runners } from "@/db/schema";

const SIMILARITY_THRESHOLD = 0.3;
const MERGE_CANDIDATE_THRESHOLD = 0.5;

export type RunnerSearchResult = {
  id: string;
  name: string;
  schoolId: string;
  schoolName: string;
};

/**
 * Fuzzy search across every runner in the league (not just the submitting school) —
 * needed so a teacher can find a mid-season transfer who hasn't been re-homed on the
 * roster yet. Matches on the runner's current name or any recorded alias.
 */
export async function searchRunners(
  query: string,
  limit = 20
): Promise<RunnerSearchResult[]> {
  const q = query.trim();
  if (!q) return [];
  const db = getDb();
  const result = await db.execute<RunnerSearchResult>(sql`
    select r.id as id, r.name as name, r.school_id as "schoolId", s.name as "schoolName"
    from runners r
    join schools s on s.id = r.school_id
    left join runner_aliases a on a.runner_id = r.id
    where similarity(r.name, ${q}) > ${SIMILARITY_THRESHOLD}
       or similarity(a.alias, ${q}) > ${SIMILARITY_THRESHOLD}
    group by r.id, r.name, r.school_id, s.name
    order by greatest(
      similarity(r.name, ${q}),
      coalesce(max(similarity(a.alias, ${q})), 0)
    ) desc
    limit ${limit}
  `);
  return result.rows;
}

export async function quickAddRunner(
  schoolId: string,
  name: string
): Promise<{ id: string; name: string; schoolId: string }> {
  const db = getDb();
  const [row] = await db
    .insert(runners)
    .values({ schoolId, name: name.trim() })
    .returning({ id: runners.id, name: runners.name, schoolId: runners.schoolId });
  return row;
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
    where r1.school_id = ${schoolId}
      and similarity(r1.name, r2.name) > ${MERGE_CANDIDATE_THRESHOLD}
    order by similarity desc
  `);
  return result.rows;
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
