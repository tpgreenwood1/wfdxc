"use server";

import { revalidatePath } from "next/cache";
import { resolveToken } from "@/lib/tokens";
import { deleteResult, upsertResult } from "@/lib/results";
import { quickAddRunner } from "@/lib/runners";

export type SubmitRow = {
  runnerId: string | null;
  newRunnerName?: string;
  position: number;
};

async function assertEditable(token: string) {
  const ctx = await resolveToken(token);
  if (!ctx) throw new Error("Invalid link");
  if (!ctx.isEditable) {
    throw new Error("This race is no longer open for edits");
  }
  return ctx;
}

export async function submitResults(
  token: string,
  rows: SubmitRow[]
): Promise<void> {
  const ctx = await assertEditable(token);

  for (const row of rows) {
    let runnerId = row.runnerId;
    if (!runnerId && row.newRunnerName?.trim()) {
      const created = await quickAddRunner(ctx.schoolId, row.newRunnerName);
      runnerId = created.id;
    }
    if (!runnerId || !Number.isFinite(row.position)) continue;

    await upsertResult({
      raceId: ctx.raceId,
      runnerId,
      schoolId: ctx.schoolId,
      position: row.position,
      submittedBy: ctx.schoolName,
    });
  }

  revalidatePath(`/submit/${token}`);
}

export async function removeResult(token: string, resultId: string): Promise<void> {
  await assertEditable(token);
  await deleteResult(resultId);
  revalidatePath(`/submit/${token}`);
}
