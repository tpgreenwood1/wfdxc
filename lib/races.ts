import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { races, results } from "@/db/schema";
import { publishRace } from "./publish";
import type { RaceStatus } from "./types";

/**
 * Flipping to 'closed' triggers the one-time publish step. Flipping back to 'open'
 * (e.g. to accept a late correction) is a normal admin action, not a distinct
 * lifecycle state — the published snapshot is left as-is until closed again.
 */
export async function setRaceStatus(
  raceId: string,
  status: RaceStatus
): Promise<void> {
  const db = getDb();
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
