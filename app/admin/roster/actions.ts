"use server";

import { revalidatePath } from "next/cache";
import { mergeRunners, renameRunner } from "@/lib/runners";

export async function mergeAction(formData: FormData): Promise<void> {
  const schoolId = String(formData.get("schoolId"));
  const canonicalId = String(formData.get("canonicalId"));
  const duplicateId = String(formData.get("duplicateId"));
  await mergeRunners(canonicalId, duplicateId);
  revalidatePath(`/admin/roster?schoolId=${schoolId}`);
}

export async function renameAction(formData: FormData): Promise<void> {
  const schoolId = String(formData.get("schoolId"));
  const runnerId = String(formData.get("runnerId"));
  const newName = String(formData.get("newName"));
  await renameRunner(runnerId, newName);
  revalidatePath(`/admin/roster?schoolId=${schoolId}`);
}
