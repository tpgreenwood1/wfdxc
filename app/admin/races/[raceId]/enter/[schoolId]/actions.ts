"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { races } from "@/db/schema";
import { getSchoolById } from "@/lib/schools";
import {
  deleteResultForSchool,
  saveSchoolResult,
  type SaveResultRow,
  type SubmittedResult,
} from "@/lib/results";
import {
  claimRunnerForSchool,
  renameRunner,
  searchOtherSchools,
  type RunnerSearchResult,
} from "@/lib/runners";
import { republishClosedRacesForRunner } from "@/lib/publish";
import { setConfirmedState } from "@/lib/raceSchoolStatus";
import { toActionResult, type ActionResult } from "@/lib/actionResult";
import { afterResultChange, revalidateRace } from "../../revalidate";

/** The admin's "enter for a school" page: the teacher entry form, bound to a school the
 * scorer picked rather than one unlocked by an access code. Deliberately never touches
 * the school cookie — these actions live under /admin, so basic auth guards them. */

async function loadSchool(schoolId: string) {
  const school = await getSchoolById(schoolId);
  if (!school) throw new Error("School not found");
  return school;
}

/** Unlike the teacher form, finalised races are fine here (each save republishes). */
async function assertRaceNotCancelled(raceId: string) {
  const db = getDb();
  const [race] = await db
    .select({ status: races.status })
    .from(races)
    .where(eq(races.id, raceId));
  if (!race) throw new Error("Race not found");
  if (race.status === "cancelled") throw new Error("This race was cancelled.");
}

async function afterChange(raceId: string, slug: string) {
  await afterResultChange(raceId);
  revalidatePath(`/school/${slug}`, "layout");
}

export async function adminSaveResultAction(
  raceId: string,
  schoolId: string,
  row: SaveResultRow
): Promise<ActionResult<{ result: SubmittedResult }>> {
  return toActionResult(async () => {
    const school = await loadSchool(schoolId);
    await assertRaceNotCancelled(raceId);
    const result = await saveSchoolResult({
      raceId,
      schoolId: school.id,
      schoolName: school.name,
      row,
      submittedBy: "admin",
    });
    await afterChange(raceId, school.slug);
    return { result };
  });
}

export async function adminRemoveResultAction(
  raceId: string,
  schoolId: string,
  resultId: string
): Promise<ActionResult> {
  return toActionResult(async () => {
    const school = await loadSchool(schoolId);
    await assertRaceNotCancelled(raceId);
    await deleteResultForSchool(resultId, raceId, school.id);
    await afterChange(raceId, school.slug);
    return {};
  });
}

export async function adminRenameRunnerAction(
  raceId: string,
  runnerId: string,
  newName: string
): Promise<ActionResult> {
  return toActionResult(async () => {
    if (!newName.trim()) throw new Error("Name can't be empty");
    await renameRunner(runnerId, newName);
    const republished = await republishClosedRacesForRunner(runnerId);
    revalidateRace(raceId, republished.length > 0);
    revalidatePath("/school", "layout");
    return {};
  });
}

export async function adminSearchOtherSchoolsAction(
  schoolId: string,
  query: string
): Promise<ActionResult<{ matches: RunnerSearchResult[] }>> {
  return toActionResult(async () => ({ matches: await searchOtherSchools(schoolId, query) }));
}

export async function adminClaimRunnerAction(
  raceId: string,
  schoolId: string,
  runnerId: string
): Promise<ActionResult> {
  return toActionResult(async () => {
    const school = await loadSchool(schoolId);
    await claimRunnerForSchool(runnerId, school.id);
    revalidatePath(`/admin/races/${raceId}`, "layout");
    revalidatePath(`/school/${school.slug}`, "layout");
    return {};
  });
}

/** "No runners" / "Race done" on the enter page, recorded as set by the admin. Bound
 * form action: (raceId, schoolId, state). */
export async function adminSetSchoolStateAction(
  raceId: string,
  schoolId: string,
  state: "done" | "no_runners" | null
): Promise<void> {
  const school = await loadSchool(schoolId);
  await setConfirmedState(raceId, school.id, state, "admin");
  revalidateRace(raceId);
  revalidatePath(`/school/${school.slug}`, "layout");
}
