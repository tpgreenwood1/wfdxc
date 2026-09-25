"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { races, runners } from "@/db/schema";
import { getSchoolBySlug } from "@/lib/schools";
import {
  grantSchoolAccess,
  hasSchoolAccess,
  isCorrectCode,
  requireSchoolAccess,
} from "@/lib/schoolAccess";
import {
  deleteResultForSchool,
  saveSchoolResult,
  type SaveResultRow,
  type SubmittedResult,
} from "@/lib/results";
import {
  claimRunnerForSchool,
  quickAddRunner,
  reactivateRunner,
  renameRunner,
  retireRunner,
  searchOtherSchools,
  type RunnerSearchResult,
} from "@/lib/runners";
import { toActionResult, type ActionResult } from "@/lib/actionResult";
import { confirmSchoolForEvent, setConfirmedState } from "@/lib/raceSchoolStatus";

/** Refreshes every tab of the school page (races counts, roster, results). */
function revalidateSchool(slug: string) {
  revalidatePath(`/school/${slug}`, "layout");
}

/** Races are league-wide (any school can enter any race), so the only check needed is
 * that the race exists and is still open — the school side is enforced by
 * requireSchoolAccess and by writing results.school_id from the unlocked school. */
async function assertRaceOpen(raceId: string) {
  const db = getDb();
  const [race] = await db
    .select({ status: races.status })
    .from(races)
    .where(eq(races.id, raceId));
  if (!race) throw new Error("Race not found");
  if (race.status !== "open") {
    throw new Error("This race is closed — contact the scorer for changes.");
  }
}

async function isRaceOpen(raceId: string): Promise<boolean> {
  const db = getDb();
  const [race] = await db
    .select({ status: races.status })
    .from(races)
    .where(eq(races.id, raceId));
  return race?.status === "open";
}

/** For the plain <form action> buttons ("No runners", "Race done", "We're done"): a
 * throw there would replace the page with an error screen, so a lapsed code sends the
 * teacher to the code gate instead. */
async function schoolForFormAction(slug: string) {
  const school = await getSchoolBySlug(slug);
  if (!school || !hasSchoolAccess(school)) redirect(`/school/${slug}`);
  return school;
}

/** A teacher may only act on runners on their own roster — a cross-school match
 * surfaced by the league-wide search isn't theirs to edit. */
async function assertOwnRunner(schoolId: string, runnerId: string) {
  const db = getDb();
  const [runner] = await db
    .select({ schoolId: runners.schoolId })
    .from(runners)
    .where(eq(runners.id, runnerId));
  if (!runner || runner.schoolId !== schoolId) {
    throw new Error("You can only edit runners on your own school's list");
  }
}

export type UnlockState = { error: string | null };

export async function unlockSchoolAction(
  slug: string,
  _prev: UnlockState,
  formData: FormData
): Promise<UnlockState> {
  const school = await getSchoolBySlug(slug);
  if (!school) return { error: "School not found." };
  const code = String(formData.get("code") ?? "");
  if (!isCorrectCode(school, code)) {
    return { error: "That code doesn't match — check it and try again." };
  }
  grantSchoolAccess(school);

  // Send them back to whichever tab they were on, but only within this school's pages.
  const returnTo = String(formData.get("returnTo") ?? "");
  redirect(returnTo.startsWith(`/school/${slug}`) ? returnTo : `/school/${slug}`);
}

/** Autosave for one runner's row on the race entry form. */
export async function saveRaceResultAction(
  slug: string,
  raceId: string,
  row: SaveResultRow
): Promise<ActionResult<{ result: SubmittedResult }>> {
  return toActionResult(async () => {
    const school = await requireSchoolAccess(slug);
    await assertRaceOpen(raceId);
    const result = await saveSchoolResult({
      raceId,
      schoolId: school.id,
      schoolName: school.name,
      row,
    });
    revalidateSchool(slug);
    return { result };
  });
}

export async function removeRaceResultAction(
  slug: string,
  raceId: string,
  resultId: string
): Promise<ActionResult> {
  return toActionResult(async () => {
    const school = await requireSchoolAccess(slug);
    await assertRaceOpen(raceId);
    await deleteResultForSchool(resultId, raceId, school.id);
    revalidateSchool(slug);
    return {};
  });
}

export async function renameRunnerAction(
  slug: string,
  runnerId: string,
  newName: string
): Promise<ActionResult> {
  return toActionResult(async () => {
    const school = await requireSchoolAccess(slug);
    if (!newName.trim()) throw new Error("Name can't be empty");
    await assertOwnRunner(school.id, runnerId);
    await renameRunner(runnerId, newName);
    revalidateSchool(slug);
    return {};
  });
}

/** The entry form filters the school's own roster on screen; this is the explicit
 * "Search other schools" fallback for a transfer who hasn't been moved over yet. */
export async function searchOtherSchoolsAction(
  slug: string,
  query: string
): Promise<ActionResult<{ matches: RunnerSearchResult[] }>> {
  return toActionResult(async () => {
    const school = await requireSchoolAccess(slug);
    return { matches: await searchOtherSchools(school.id, query) };
  });
}

/** "Move them to our list" after entering a transfer from another school. */
export async function claimRunnerAction(slug: string, runnerId: string): Promise<ActionResult> {
  return toActionResult(async () => {
    const school = await requireSchoolAccess(slug);
    await claimRunnerForSchool(runnerId, school.id);
    revalidateSchool(slug);
    return {};
  });
}

/** Takes a list so a teacher can paste a whole class in at the start of the season. */
export async function addRunnersAction(
  slug: string,
  names: string[]
): Promise<ActionResult<{ created: { id: string; name: string }[] }>> {
  return toActionResult(async () => {
    const school = await requireSchoolAccess(slug);
    const cleaned = names.map((n) => n.trim()).filter(Boolean);
    if (cleaned.length === 0) throw new Error("Name can't be empty");
    const created = [];
    for (const name of cleaned) {
      const runner = await quickAddRunner(school.id, name);
      created.push({ id: runner.id, name: runner.name });
    }
    revalidateSchool(slug);
    return { created };
  });
}

/** Hides a pupil who's left from entry forms and search; never deletes them or their
 * past results. */
export async function retireRunnerAction(slug: string, runnerId: string): Promise<ActionResult> {
  return toActionResult(async () => {
    const school = await requireSchoolAccess(slug);
    await assertOwnRunner(school.id, runnerId);
    await retireRunner(runnerId);
    revalidateSchool(slug);
    return {};
  });
}

export async function reactivateRunnerAction(
  slug: string,
  runnerId: string
): Promise<ActionResult> {
  return toActionResult(async () => {
    const school = await requireSchoolAccess(slug);
    await assertOwnRunner(school.id, runnerId);
    await reactivateRunner(runnerId);
    revalidateSchool(slug);
    return {};
  });
}

/** Teacher says their school had nobody in this race (or undoes that), so the scorer
 * stops chasing them for it. Bound form action: (slug, raceId, on). */
export async function setNoRunnersAction(slug: string, raceId: string, on: boolean): Promise<void> {
  const school = await schoolForFormAction(slug);
  // Finalised since the page loaded: just refresh, which shows the "closed" notice.
  if (await isRaceOpen(raceId)) {
    await setConfirmedState(raceId, school.id, on ? "no_runners" : null, "teacher");
  }
  revalidateSchool(slug);
  revalidatePath(`/admin/races/${raceId}`);
}

/** Teacher says they've entered everyone for this race (or undoes that), so the scorer
 * can finalise and announce it without waiting for the whole event. Bound form action:
 * (slug, raceId, on). */
export async function setRaceDoneAction(slug: string, raceId: string, on: boolean): Promise<void> {
  const school = await schoolForFormAction(slug);
  if (await isRaceOpen(raceId)) {
    await setConfirmedState(raceId, school.id, on ? "done" : null, "teacher");
  }
  revalidateSchool(slug);
  revalidatePath("/admin", "layout");
}

/** "We're done": every open race in the event is confirmed for this school — races
 * with runners entered as done, the rest as no runners. */
export async function confirmEventDoneAction(slug: string, eventId: string): Promise<void> {
  const school = await schoolForFormAction(slug);
  await confirmSchoolForEvent(eventId, school.id, "teacher");
  revalidateSchool(slug);
  revalidatePath(`/admin/events/${eventId}`);
  revalidatePath("/admin");
}
