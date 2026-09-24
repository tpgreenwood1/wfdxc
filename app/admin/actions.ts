"use server";

import { revalidatePath } from "next/cache";
import { eq, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { events, races, results, runners, schools, seasons } from "@/db/schema";
import { createEvent } from "@/lib/events";

export async function createSeasonAction(formData: FormData): Promise<void> {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("Season name is required");
  const db = getDb();
  await db.insert(seasons).values({ name });
  revalidatePath("/admin");
}

export async function updateMinRacesAction(formData: FormData): Promise<void> {
  const seasonId = String(formData.get("seasonId"));
  const minRacesRequired = Number(formData.get("minRacesRequired"));
  if (!seasonId || !Number.isFinite(minRacesRequired)) {
    throw new Error("Invalid input");
  }
  const db = getDb();
  await db
    .update(seasons)
    .set({ minRacesRequired })
    .where(eq(seasons.id, seasonId));
  revalidatePath("/admin");
  revalidatePath("/standings");
}

export async function createEventAction(formData: FormData): Promise<void> {
  const seasonId = String(formData.get("seasonId"));
  const name = String(formData.get("name") ?? "").trim();
  const date = String(formData.get("date") ?? "");
  const location = String(formData.get("location") ?? "").trim() || undefined;
  if (!seasonId || !name || !date) throw new Error("Missing required fields");

  const { eventId } = await createEvent({ seasonId, name, date, location });
  revalidatePath("/admin");
  revalidatePath(`/admin/events/${eventId}`);
}

export async function createSchoolAction(formData: FormData): Promise<void> {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("School name is required");
  const db = getDb();
  await db.insert(schools).values({ name });
  revalidatePath("/admin");
}

/**
 * Schools are referenced with ON DELETE RESTRICT from runners/results (that history
 * shouldn't vanish silently), so a school that already has runners or results can't
 * be deleted here — those need merging/reassigning first. Submission tokens for the
 * school cascade-delete automatically.
 */
export async function deleteSchoolAction(formData: FormData): Promise<void> {
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
    throw new Error(
      `Can't delete this school — it has ${runnerCount.count} runner(s) and ${resultCount.count} result(s) attached. Reassign or merge those first.`
    );
  }

  await db.delete(schools).where(eq(schools.id, schoolId));
  revalidatePath("/admin");
}

/**
 * events -> races -> results/tokens/published_* all cascade at the DB level, so
 * deleting an event would silently wipe any real results already recorded for it.
 * Guarded the same way as school deletion: refuse if any of the event's races have
 * submitted results, so this only ever removes an empty (e.g. duplicate test) event.
 */
export async function deleteEventAction(formData: FormData): Promise<void> {
  const eventId = String(formData.get("eventId"));
  const db = getDb();

  const [resultCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(results)
    .innerJoin(races, eq(results.raceId, races.id))
    .where(eq(races.eventId, eventId));

  if (resultCount.count > 0) {
    throw new Error(
      `Can't delete this event — it has ${resultCount.count} result(s) submitted across its races. Cancel or reassign those first.`
    );
  }

  await db.delete(events).where(eq(events.id, eventId));
  revalidatePath("/admin");
}
