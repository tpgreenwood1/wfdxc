"use server";

import { revalidatePath } from "next/cache";
import {
  dismissMergeCandidate,
  mergeRunners,
  moveRunnerToSchool,
  quickAddRunner,
  reactivateRunner,
  renameRunner,
  retireRunner,
} from "@/lib/runners";

export async function mergeAction(formData: FormData): Promise<void> {
  const schoolId = String(formData.get("schoolId"));
  const canonicalId = String(formData.get("canonicalId"));
  const duplicateId = String(formData.get("duplicateId"));
  await mergeRunners(canonicalId, duplicateId);
  revalidatePath(`/admin/roster?schoolId=${schoolId}`);
}

export async function dismissMergeCandidateAction(formData: FormData): Promise<void> {
  const schoolId = String(formData.get("schoolId"));
  const runnerAId = String(formData.get("runnerAId"));
  const runnerBId = String(formData.get("runnerBId"));
  await dismissMergeCandidate(runnerAId, runnerBId);
  revalidatePath(`/admin/roster?schoolId=${schoolId}`);
}

export async function renameAction(formData: FormData): Promise<void> {
  const schoolId = String(formData.get("schoolId"));
  const runnerId = String(formData.get("runnerId"));
  const newName = String(formData.get("newName"));
  await renameRunner(runnerId, newName);
  revalidatePath(`/admin/roster?schoolId=${schoolId}`);
}

export async function addRunnerAction(formData: FormData): Promise<void> {
  const schoolId = String(formData.get("schoolId"));
  const name = String(formData.get("name"));
  if (!name.trim()) throw new Error("Name can't be empty");
  await quickAddRunner(schoolId, name);
  revalidatePath(`/admin/roster?schoolId=${schoolId}`);
}

export async function moveSchoolAction(formData: FormData): Promise<void> {
  const schoolId = String(formData.get("schoolId"));
  const runnerId = String(formData.get("runnerId"));
  const newSchoolId = String(formData.get("newSchoolId"));
  await moveRunnerToSchool(runnerId, newSchoolId);
  revalidatePath(`/admin/roster?schoolId=${schoolId}`);
  revalidatePath(`/admin/roster?schoolId=${newSchoolId}`);
}

export async function retireAction(formData: FormData): Promise<void> {
  const schoolId = String(formData.get("schoolId"));
  const runnerId = String(formData.get("runnerId"));
  await retireRunner(runnerId);
  revalidatePath(`/admin/roster?schoolId=${schoolId}`);
}

export async function reactivateAction(formData: FormData): Promise<void> {
  const schoolId = String(formData.get("schoolId"));
  const runnerId = String(formData.get("runnerId"));
  await reactivateRunner(runnerId);
  revalidatePath(`/admin/roster?schoolId=${schoolId}`);
}
