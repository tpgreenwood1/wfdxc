"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { updateResultInline } from "@/lib/races";
import { republishClosedRacesForRunner, republishIfClosed } from "@/lib/publish";
import {
  dismissMergeCandidate,
  mergeRunners,
  MergeCollisionError,
  moveRunnerToSchool,
  quickAddRunner,
  reactivateRunner,
  renameRunner,
  retireRunner,
  type MergeCollision,
} from "@/lib/runners";

function revalidateRunners(runnerId?: string) {
  revalidatePath("/admin/runners");
  if (runnerId) revalidatePath(`/admin/runners/${runnerId}`);
}

function revalidatePublic(republished: boolean) {
  if (!republished) return;
  revalidatePath("/results", "layout");
  revalidatePath("/standings");
}

/** Renaming also republishes the runner's finalised races so the corrected name
 * shows on public results and standings (published rows store a frozen name). */
export async function renameRunnerAction(formData: FormData): Promise<void> {
  const runnerId = String(formData.get("runnerId"));
  const newName = String(formData.get("newName") ?? "").trim();
  if (!newName) throw new Error("Name can't be empty");
  await renameRunner(runnerId, newName);
  const republished = await republishClosedRacesForRunner(runnerId);
  revalidateRunners(runnerId);
  revalidatePublic(republished.length > 0);
}

/** Changes the runner's current school (future entries). Past results keep the
 * school they ran for — fix those individually in the race history. */
export async function moveRunnerAction(formData: FormData): Promise<void> {
  const runnerId = String(formData.get("runnerId"));
  const newSchoolId = String(formData.get("newSchoolId"));
  await moveRunnerToSchool(runnerId, newSchoolId);
  revalidateRunners(runnerId);
}

export async function retireRunnerAction(formData: FormData): Promise<void> {
  const runnerId = String(formData.get("runnerId"));
  await retireRunner(runnerId);
  revalidateRunners(runnerId);
}

export async function reactivateRunnerAction(formData: FormData): Promise<void> {
  const runnerId = String(formData.get("runnerId"));
  await reactivateRunner(runnerId);
  revalidateRunners(runnerId);
}

export async function addRunnerAction(formData: FormData): Promise<void> {
  const schoolId = String(formData.get("schoolId"));
  const name = String(formData.get("name") ?? "");
  if (!name.trim()) throw new Error("Name can't be empty");
  await quickAddRunner(schoolId, name);
  revalidateRunners();
}

/** Which school a runner ran for in one race — for a transfer credited to the wrong
 * school. Doesn't touch their current school. */
export async function setResultSchoolAction(formData: FormData): Promise<void> {
  const runnerId = String(formData.get("runnerId"));
  const resultId = String(formData.get("resultId"));
  const raceId = String(formData.get("raceId"));
  const schoolId = String(formData.get("schoolId"));
  await updateResultInline(resultId, { schoolId });
  const republished = await republishIfClosed(raceId);
  revalidateRunners(runnerId);
  revalidatePath(`/admin/races/${raceId}`);
  revalidatePath(`/results/${raceId}`);
  revalidatePublic(republished);
}

export type MergeResult = { error?: string; collisions?: MergeCollision[] };

/** Merges `duplicateId` into `canonicalId`. Refuses (with the clashing races) if both
 * have a result in the same race. `redirectTo=canonical` sends the admin on to the
 * surviving runner's page, since the page they were on no longer exists. */
export async function mergeRunnersAction(formData: FormData): Promise<MergeResult> {
  const canonicalId = String(formData.get("canonicalId"));
  const duplicateId = String(formData.get("duplicateId"));
  try {
    await mergeRunners(canonicalId, duplicateId);
  } catch (err) {
    if (err instanceof MergeCollisionError) {
      return { error: err.message, collisions: err.collisions };
    }
    console.error(err);
    return { error: "Couldn't merge — please try again." };
  }
  const republished = await republishClosedRacesForRunner(canonicalId);
  revalidateRunners(canonicalId);
  revalidatePublic(republished.length > 0);
  if (formData.get("redirectTo") === "canonical") redirect(`/admin/runners/${canonicalId}`);
  return {};
}

export async function dismissCandidateAction(formData: FormData): Promise<void> {
  const runnerAId = String(formData.get("runnerAId"));
  const runnerBId = String(formData.get("runnerBId"));
  await dismissMergeCandidate(runnerAId, runnerBId);
  revalidateRunners();
}
