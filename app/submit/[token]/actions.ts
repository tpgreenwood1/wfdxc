"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { runners } from "@/db/schema";
import { resolveToken } from "@/lib/tokens";
import {
  deleteResultForSchool,
  saveSchoolResult,
  type SaveResultRow,
  type SubmittedResult,
} from "@/lib/results";
import { renameRunner, searchOtherSchools, type RunnerSearchResult } from "@/lib/runners";
import { toActionResult, type ActionResult } from "@/lib/actionResult";

async function assertEditable(token: string) {
  const ctx = await resolveToken(token);
  if (!ctx) throw new Error("Invalid link");
  if (!ctx.isEditable) {
    throw new Error("This race is no longer open for edits");
  }
  return ctx;
}

/** Autosave for one runner's row on the entry form. */
export async function saveResult(
  token: string,
  row: SaveResultRow
): Promise<ActionResult<{ result: SubmittedResult }>> {
  return toActionResult(async () => {
    const ctx = await assertEditable(token);
    const result = await saveSchoolResult({
      raceId: ctx.raceId,
      schoolId: ctx.schoolId,
      schoolName: ctx.schoolName,
      row,
    });
    revalidatePath(`/submit/${token}`);
    return { result };
  });
}

export async function removeResult(token: string, resultId: string): Promise<ActionResult> {
  return toActionResult(async () => {
    const ctx = await assertEditable(token);
    await deleteResultForSchool(resultId, ctx.raceId, ctx.schoolId);
    revalidatePath(`/submit/${token}`);
    return {};
  });
}

/** Lets a teacher fix a typo they spot on their own roster (e.g. a misspelled name)
 * without going through the admin. Scoped to their own school's runners only — a
 * cross-school match surfaced by "Search other schools" isn't theirs to rename. */
export async function renameRunnerAction(
  token: string,
  runnerId: string,
  newName: string
): Promise<ActionResult> {
  return toActionResult(async () => {
    const ctx = await assertEditable(token);
    const db = getDb();
    const [runner] = await db
      .select({ schoolId: runners.schoolId })
      .from(runners)
      .where(eq(runners.id, runnerId));
    if (!runner || runner.schoolId !== ctx.schoolId) {
      throw new Error("You can only rename runners on your own roster");
    }
    if (!newName.trim()) throw new Error("Name can't be empty");
    await renameRunner(runnerId, newName);
    revalidatePath(`/submit/${token}`);
    return {};
  });
}

export async function searchOtherSchoolsAction(
  token: string,
  query: string
): Promise<ActionResult<{ matches: RunnerSearchResult[] }>> {
  return toActionResult(async () => {
    const ctx = await resolveToken(token);
    if (!ctx) throw new Error("Invalid link");
    return { matches: await searchOtherSchools(ctx.schoolId, query) };
  });
}
