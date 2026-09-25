"use server";

import { revalidatePath } from "next/cache";
import { getEventBoard } from "@/lib/eventBoard";
import { addRaceToEvent, GENDERS, updateEvent, YEAR_GROUPS } from "@/lib/events";
import { setRaceStatus } from "@/lib/races";
import { confirmSchoolForEvent } from "@/lib/raceSchoolStatus";
import type { Gender, YearGroup } from "@/lib/types";

function revalidateEvent(eventId: string) {
  revalidatePath(`/admin/events/${eventId}`);
  revalidatePath("/admin");
  revalidatePath("/admin/events");
}

/** Finalises every open race in the event that's ready: has results, no open
 * duplicate/missing places, and no school that's neither entered nor confirmed. */
export async function finaliseReadyRacesAction(formData: FormData): Promise<void> {
  const eventId = String(formData.get("eventId"));
  const board = await getEventBoard(eventId);
  if (!board) throw new Error("Event not found");
  for (const race of board.races) {
    if (race.status === "open" && race.readiness.ready) {
      await setRaceStatus(race.id, "closed");
      revalidatePath(`/results/${race.id}`);
    }
  }
  revalidateEvent(eventId);
  revalidatePath("/results");
  revalidatePath("/standings");
}

export async function updateEventAction(formData: FormData): Promise<void> {
  const eventId = String(formData.get("eventId"));
  const name = String(formData.get("name") ?? "").trim();
  const date = String(formData.get("date") ?? "");
  const location = String(formData.get("location") ?? "").trim() || undefined;
  if (!name || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Name and date are required");
  await updateEvent(eventId, { name, date, location });
  revalidateEvent(eventId);
  revalidatePath("/results");
}

/** The admin marks a school done for the whole event on its behalf (e.g. the teacher
 * said so in person): entered races -> done, empty races -> no runners. */
export async function confirmSchoolForEventAction(formData: FormData): Promise<void> {
  const eventId = String(formData.get("eventId"));
  const schoolId = String(formData.get("schoolId"));
  await confirmSchoolForEvent(eventId, schoolId, "admin");
  revalidateEvent(eventId);
}

export async function addRaceAction(formData: FormData): Promise<void> {
  const eventId = String(formData.get("eventId"));
  const [yearGroup, gender] = String(formData.get("race") ?? "").split(":");
  if (!YEAR_GROUPS.includes(yearGroup as YearGroup) || !GENDERS.includes(gender as Gender)) {
    throw new Error("Pick a race to add");
  }
  await addRaceToEvent(eventId, { yearGroup: yearGroup as YearGroup, gender: gender as Gender });
  revalidateEvent(eventId);
}

/** Race status change from the event board (cancel / reopen), without leaving it. */
export async function setRaceStatusFromBoardAction(formData: FormData): Promise<void> {
  const eventId = String(formData.get("eventId"));
  const raceId = String(formData.get("raceId"));
  const status = String(formData.get("status"));
  if (status !== "open" && status !== "closed" && status !== "cancelled") {
    throw new Error("Invalid status");
  }
  await setRaceStatus(raceId, status);
  revalidateEvent(eventId);
  revalidatePath(`/admin/races/${raceId}`);
  revalidatePath(`/results/${raceId}`);
  revalidatePath("/results");
  revalidatePath("/standings");
}
