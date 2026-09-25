"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { runners } from "@/db/schema";
import { resolveHubToken } from "@/lib/hubTokens";
import { quickAddRunner, reactivateRunner, renameRunner, retireRunner } from "@/lib/runners";

async function assertHub(token: string) {
  const ctx = await resolveHubToken(token);
  if (!ctx) throw new Error("Invalid link");
  return ctx;
}

/** A teacher may only act on runners on their own roster — a cross-school match
 * surfaced elsewhere isn't theirs to edit. */
async function assertOwnRunner(schoolId: string, runnerId: string) {
  const db = getDb();
  const [runner] = await db
    .select({ schoolId: runners.schoolId })
    .from(runners)
    .where(eq(runners.id, runnerId));
  if (!runner || runner.schoolId !== schoolId) {
    throw new Error("You can only edit runners on your own roster");
  }
}

/** Lets a teacher build out their roster before race day — e.g. typing in 10 new
 * runners ahead of time — rather than only being able to add names while entering
 * results for a specific, already-open race. The hub token is scoped to (event,
 * school), not any one race, and doesn't expire, so this works any time. */
export async function addRosterRunnerAction(
  token: string,
  name: string
): Promise<{ id: string; name: string }> {
  const ctx = await assertHub(token);
  if (!name.trim()) throw new Error("Name can't be empty");
  const runner = await quickAddRunner(ctx.schoolId, name);
  revalidatePath(`/hub/${token}`);
  return { id: runner.id, name: runner.name };
}

/** Scoped to the teacher's own school's runners only — a cross-school match isn't
 * theirs to rename. */
export async function renameRosterRunnerAction(
  token: string,
  runnerId: string,
  newName: string
): Promise<void> {
  const ctx = await assertHub(token);
  if (!newName.trim()) throw new Error("Name can't be empty");
  await assertOwnRunner(ctx.schoolId, runnerId);
  await renameRunner(runnerId, newName);
  revalidatePath(`/hub/${token}`);
}

/** Lets a teacher hide a pupil who's aged out/graduated from their own entry forms
 * and search — mirrors the admin roster tool's retire feature, scoped to the
 * teacher's own school. Never deletes the runner or their past results. */
export async function retireRosterRunnerAction(
  token: string,
  runnerId: string
): Promise<void> {
  const ctx = await assertHub(token);
  await assertOwnRunner(ctx.schoolId, runnerId);
  await retireRunner(runnerId);
  revalidatePath(`/hub/${token}`);
}

/** Undoes a retirement done in error, or a runner who returns. */
export async function reactivateRosterRunnerAction(
  token: string,
  runnerId: string
): Promise<void> {
  const ctx = await assertHub(token);
  await assertOwnRunner(ctx.schoolId, runnerId);
  await reactivateRunner(runnerId);
  revalidatePath(`/hub/${token}`);
}
