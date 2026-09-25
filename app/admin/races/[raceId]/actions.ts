"use server";

import { revalidatePath } from "next/cache";
import { setRaceStatus, updateResultInline } from "@/lib/races";
import { deleteResult, upsertResult } from "@/lib/results";
import { publishRace } from "@/lib/publish";
import { quickAddRunner } from "@/lib/runners";
import { regenerateToken } from "@/lib/tokens";
import type { RaceStatus } from "@/lib/types";

export async function setStatusAction(formData: FormData): Promise<void> {
  const raceId = String(formData.get("raceId"));
  const status = String(formData.get("status")) as RaceStatus;
  await setRaceStatus(raceId, status);
  revalidatePath(`/admin/races/${raceId}`);
  revalidatePath(`/results/${raceId}`);
}

export async function republishAction(formData: FormData): Promise<void> {
  const raceId = String(formData.get("raceId"));
  await publishRace(raceId);
  revalidatePath(`/admin/races/${raceId}`);
  revalidatePath(`/results/${raceId}`);
  revalidatePath("/standings");
}

export async function updateResultAction(formData: FormData): Promise<void> {
  const raceId = String(formData.get("raceId"));
  const resultId = String(formData.get("resultId"));
  const positionRaw = formData.get("position");
  const runnerIdRaw = formData.get("runnerId");
  const schoolIdRaw = formData.get("schoolId");

  const updates: { position?: number; runnerId?: string; schoolId?: string } = {};
  if (positionRaw !== null) {
    const position = Number(positionRaw);
    if (!Number.isFinite(position)) throw new Error("Invalid position");
    updates.position = position;
  }
  if (runnerIdRaw) updates.runnerId = String(runnerIdRaw);
  if (schoolIdRaw) updates.schoolId = String(schoolIdRaw);

  await updateResultInline(resultId, updates);
  revalidatePath(`/admin/races/${raceId}`);
}

export async function addResultAction(
  formData: FormData
): Promise<{ id: string }> {
  const raceId = String(formData.get("raceId"));
  const runnerId = String(formData.get("runnerId"));
  const schoolId = String(formData.get("schoolId"));
  const position = Number(formData.get("position"));
  if (!Number.isFinite(position)) throw new Error("Invalid position");

  const row = await upsertResult({
    raceId,
    runnerId,
    schoolId,
    position,
    submittedBy: "admin",
  });
  revalidatePath(`/admin/races/${raceId}`);
  return row;
}

/** Creates a runner who isn't in the system yet (e.g. a new kid who turned up on
 * race day) so they can immediately be slotted into a result — used by the admin
 * race table's runner picker alongside searching for an existing runner. */
export async function createRunnerAction(
  formData: FormData
): Promise<{ id: string; name: string; schoolId: string; schoolName: string }> {
  const raceId = String(formData.get("raceId"));
  const name = String(formData.get("name"));
  const schoolId = String(formData.get("schoolId"));
  if (!name.trim()) throw new Error("Name can't be empty");
  if (!schoolId) throw new Error("School is required");

  const runner = await quickAddRunner(schoolId, name);
  revalidatePath(`/admin/races/${raceId}`);
  return runner;
}

export async function deleteResultAction(formData: FormData): Promise<void> {
  const raceId = String(formData.get("raceId"));
  const resultId = String(formData.get("resultId"));
  await deleteResult(resultId);
  revalidatePath(`/admin/races/${raceId}`);
}

export async function regenerateTokenAction(formData: FormData): Promise<void> {
  const raceId = String(formData.get("raceId"));
  const tokenId = String(formData.get("tokenId"));
  await regenerateToken(tokenId);
  revalidatePath(`/admin/races/${raceId}`);
}
