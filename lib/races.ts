import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  publishedIndividualResults,
  publishedTeamResults,
  racePositionAcks,
  races,
  results,
} from "@/db/schema";
import { publishRace } from "./publish";
import type { PositionAck } from "./raceIssues";
import { applySteps, type PositionStep } from "./positionOps";
import type { RaceStatus } from "./types";

// Pure label/sort helpers live in raceLabels.ts so client components can use them
// without pulling in the database client.
export { YEAR_GROUP_ORDER, raceLabel, sortRaces } from "./raceLabels";

/**
 * Flipping to 'closed' triggers the one-time publish step. Flipping back to 'open'
 * (e.g. to accept a late correction) is a normal admin action, not a distinct
 * lifecycle state — the published snapshot is left as-is (still public, still in
 * standings) until closed again. Cancelling removes the snapshot, so a cancelled race
 * never shows publicly or counts towards standings even if it had been finalised.
 */
export async function setRaceStatus(
  raceId: string,
  status: RaceStatus
): Promise<void> {
  const db = getDb();
  if (status === "cancelled") {
    await db.transaction(async (tx) => {
      await tx
        .update(races)
        .set({ status, publishedAt: null, publishedResultCount: null })
        .where(eq(races.id, raceId));
      await tx
        .delete(publishedIndividualResults)
        .where(eq(publishedIndividualResults.raceId, raceId));
      await tx.delete(publishedTeamResults).where(eq(publishedTeamResults.raceId, raceId));
    });
    return;
  }

  await db.update(races).set({ status }).where(eq(races.id, raceId));
  if (status === "closed") {
    await publishRace(raceId);
  }
}

export async function updateResultInline(
  resultId: string,
  updates: { position?: number; runnerId?: string; schoolId?: string }
): Promise<void> {
  const db = getDb();
  await db
    .update(results)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(results.id, resultId));
}

/**
 * Applies a drag/drop move (see positionOps.ts) atomically: the race's results are
 * locked so a teacher saving at the same moment can't interleave with a shift, and
 * the same pure function the admin table used optimistically decides the outcome.
 */
export async function applyPositionSteps(
  raceId: string,
  steps: PositionStep[]
): Promise<{ error?: string }> {
  const db = getDb();
  return db.transaction(async (tx) => {
    const rows = await tx
      .select({ id: results.id, position: results.position })
      .from(results)
      .where(eq(results.raceId, raceId))
      .for("update");
    const acks = await tx
      .select({
        position: racePositionAcks.position,
        kind: racePositionAcks.kind,
        note: racePositionAcks.note,
      })
      .from(racePositionAcks)
      .where(eq(racePositionAcks.raceId, raceId));

    const out = applySteps(rows, acks, steps);
    if ("error" in out) return { error: out.error };

    const before = new Map(rows.map((r) => [r.id, r.position]));
    const changed = out.rows.filter((r) => before.get(r.id) !== r.position);
    if (changed.length > 0) {
      const values = sql.join(
        changed.map((r) => sql`(${r.id}::uuid, ${r.position}::int)`),
        sql`, `
      );
      await tx.execute(sql`
        update ${results} set position = v.position, updated_at = now()
        from (values ${values}) as v(id, position)
        where ${results.id} = v.id and ${results.raceId} = ${raceId}
      `);
    }

    // Acks are few and unique per (place, kind), so rewriting them avoids
    // transient unique clashes while shifting.
    const key = (a: PositionAck) => `${a.position}:${a.kind}:${a.note ?? ""}`;
    const acksChanged =
      acks.map(key).sort().join("|") !== out.acks.map(key).sort().join("|");
    if (acksChanged) {
      await tx.delete(racePositionAcks).where(eq(racePositionAcks.raceId, raceId));
      if (out.acks.length > 0) {
        await tx.insert(racePositionAcks).values(out.acks.map((a) => ({ raceId, ...a })));
      }
    }
    return {};
  });
}

/** The runner's existing result in this race, if any — adding them again would
 * silently overwrite their place via the (race, runner) upsert. */
export async function findRunnerResultInRace(
  raceId: string,
  runnerId: string
): Promise<{ id: string; position: number } | null> {
  const db = getDb();
  const [row] = await db
    .select({ id: results.id, position: results.position })
    .from(results)
    .where(and(eq(results.raceId, raceId), eq(results.runnerId, runnerId)));
  return row ?? null;
}

export async function getPositionAcks(raceId: string): Promise<PositionAck[]> {
  const db = getDb();
  return db
    .select({
      position: racePositionAcks.position,
      kind: racePositionAcks.kind,
      note: racePositionAcks.note,
    })
    .from(racePositionAcks)
    .where(eq(racePositionAcks.raceId, raceId));
}

/** raceId -> acks, for every race in an event (the race-day board). */
export async function getPositionAcksForEvent(
  eventId: string
): Promise<Map<string, PositionAck[]>> {
  const db = getDb();
  const rows = await db
    .select({
      raceId: racePositionAcks.raceId,
      position: racePositionAcks.position,
      kind: racePositionAcks.kind,
      note: racePositionAcks.note,
    })
    .from(racePositionAcks)
    .innerJoin(races, eq(racePositionAcks.raceId, races.id))
    .where(eq(races.eventId, eventId));
  const byRace = new Map<string, PositionAck[]>();
  for (const { raceId, ...ack } of rows) {
    const list = byRace.get(raceId) ?? [];
    list.push(ack);
    byRace.set(raceId, list);
  }
  return byRace;
}

export async function setPositionAck(
  raceId: string,
  position: number,
  kind: "tie" | "gap",
  note: string | null
): Promise<void> {
  const db = getDb();
  await db
    .insert(racePositionAcks)
    .values({ raceId, position, kind, note })
    .onConflictDoUpdate({
      target: [racePositionAcks.raceId, racePositionAcks.position, racePositionAcks.kind],
      set: { note },
    });
}

export async function clearPositionAck(
  raceId: string,
  position: number,
  kind: "tie" | "gap"
): Promise<void> {
  const db = getDb();
  await db
    .delete(racePositionAcks)
    .where(
      and(
        eq(racePositionAcks.raceId, raceId),
        eq(racePositionAcks.position, position),
        eq(racePositionAcks.kind, kind)
      )
    );
}
