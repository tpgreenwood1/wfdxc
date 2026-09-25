"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { events, races, results, runners, schools, seasons } from "@/db/schema";
import { createEvent, GENDERS, YEAR_GROUPS, type RaceSpec } from "@/lib/events";
import { createSchool, regenerateAccessCode, renameSchool } from "@/lib/schools";
import type { Gender, YearGroup } from "@/lib/types";

/** Returned instead of thrown so the admin sees the actual reason — Next replaces
 * thrown server-action messages with a generic error in production. */
export type AdminActionResult = { error?: string };

/** Every admin page that lists schools/events/seasons. */
function revalidateAdmin() {
  revalidatePath("/admin", "layout");
}

export async function createSeasonAction(formData: FormData): Promise<void> {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("Season name is required");
  const db = getDb();
  await db.insert(seasons).values({ name });
  revalidateAdmin();
}

export async function updateMinRacesAction(formData: FormData): Promise<void> {
  const seasonId = String(formData.get("seasonId"));
  const minRacesRequired = Number(formData.get("minRacesRequired"));
  if (!seasonId || !Number.isInteger(minRacesRequired) || minRacesRequired < 0) {
    throw new Error("Invalid input");
  }
  const db = getDb();
  await db
    .update(seasons)
    .set({ minRacesRequired })
    .where(eq(seasons.id, seasonId));
  revalidateAdmin();
  revalidatePath("/standings");
}

/** Race checkboxes post "y3:girls"-style values; none ticked means every race. */
function parseRaceSpecs(values: FormDataEntryValue[]): RaceSpec[] {
  return values
    .map((v) => String(v).split(":"))
    .filter(
      ([y, g]) => YEAR_GROUPS.includes(y as YearGroup) && GENDERS.includes(g as Gender)
    )
    .map(([y, g]) => ({ yearGroup: y as YearGroup, gender: g as Gender }));
}

export async function createEventAction(formData: FormData): Promise<void> {
  const seasonId = String(formData.get("seasonId"));
  const name = String(formData.get("name") ?? "").trim();
  const date = String(formData.get("date") ?? "");
  const location = String(formData.get("location") ?? "").trim() || undefined;
  if (!seasonId || !name || !date) throw new Error("Missing required fields");

  const { eventId } = await createEvent({
    seasonId,
    name,
    date,
    location,
    races: parseRaceSpecs(formData.getAll("races")),
  });
  revalidateAdmin();
  redirect(`/admin/events/${eventId}`);
}

export async function createSchoolAction(formData: FormData): Promise<void> {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("School name is required");
  await createSchool(name);
  revalidateAdmin();
}

export async function renameSchoolAction(formData: FormData): Promise<void> {
  const schoolId = String(formData.get("schoolId"));
  const name = String(formData.get("name") ?? "");
  await renameSchool(schoolId, name);
  revalidateAdmin();
  revalidatePath("/school/[slug]", "layout");
}

/** New access code for a school's home page — logs out every teacher device unlocked
 * with the old code, e.g. if the teacher link was forwarded somewhere it shouldn't be. */
export async function regenerateSchoolCodeAction(formData: FormData): Promise<void> {
  const schoolId = String(formData.get("schoolId"));
  await regenerateAccessCode(schoolId);
  revalidateAdmin();
}

/**
 * Schools are referenced with ON DELETE RESTRICT from runners/results (that history
 * shouldn't vanish silently), so a school that already has runners or results can't
 * be deleted here — those need merging/reassigning first. Submission tokens for the
 * school cascade-delete automatically.
 */
export async function deleteSchoolAction(formData: FormData): Promise<AdminActionResult> {
  const schoolId = String(formData.get("schoolId"));
  const db = getDb();

  const [runnerCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(runners)
    .where(eq(runners.schoolId, schoolId));
  const [resultCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(results)
    .where(eq(results.schoolId, schoolId));

  if (runnerCount.count > 0 || resultCount.count > 0) {
    return {
      error: `Can't delete this school — it has ${runnerCount.count} runner(s) and ${resultCount.count} result(s). Move or merge those runners first (Runners page).`,
    };
  }

  await db.delete(schools).where(eq(schools.id, schoolId));
  revalidateAdmin();
  return {};
}

/**
 * events -> races -> results/tokens/published_* all cascade at the DB level, so
 * deleting an event would silently wipe any real results already recorded for it.
 * Guarded the same way as school deletion: refuse if any of the event's races have
 * submitted results, so this only ever removes an empty (e.g. duplicate test) event.
 */
export async function deleteEventAction(formData: FormData): Promise<AdminActionResult> {
  const eventId = String(formData.get("eventId"));
  const db = getDb();

  const [resultCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(results)
    .innerJoin(races, eq(results.raceId, races.id))
    .where(eq(races.eventId, eventId));

  if (resultCount.count > 0) {
    return {
      error: `Can't delete this event — it has ${resultCount.count} result(s) entered. Cancel its races instead.`,
    };
  }

  await db.delete(events).where(eq(events.id, eventId));
  revalidateAdmin();
  return {};
}
