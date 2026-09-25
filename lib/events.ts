import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { events, races } from "@/db/schema";
import { createTokensForRace } from "./tokens";
import type { Gender, YearGroup } from "./types";

export const YEAR_GROUPS: YearGroup[] = [
  "reception",
  "y1",
  "y2",
  "y3",
  "y4",
  "y5",
  "y6",
];
export const GENDERS: Gender[] = ["boys", "girls"];

export type RaceSpec = { yearGroup: YearGroup; gender: Gender };

export const ALL_RACES: RaceSpec[] = YEAR_GROUPS.flatMap((yearGroup) =>
  GENDERS.map((gender) => ({ yearGroup, gender }))
);

/**
 * Creates the event plus one race per chosen (year_group x gender) combination —
 * every combination by default — each 'open' and pre-loaded with a submission token
 * for every school, so links are ready to distribute the moment the event exists.
 */
export async function createEvent(input: {
  seasonId: string;
  name: string;
  date: string; // YYYY-MM-DD
  location?: string;
  races?: RaceSpec[];
}): Promise<{ eventId: string }> {
  const raceSpecs = input.races && input.races.length > 0 ? input.races : ALL_RACES;
  const db = getDb();

  const [event] = await db
    .insert(events)
    .values({
      seasonId: input.seasonId,
      name: input.name,
      date: input.date,
      location: input.location,
    })
    .returning({ id: events.id });

  const createdRaces = await db
    .insert(races)
    .values(
      raceSpecs.map(({ yearGroup, gender }) => ({
        eventId: event.id,
        yearGroup,
        gender,
        status: "open" as const,
      }))
    )
    .returning({ id: races.id });

  const eventDate = new Date(input.date);
  await Promise.all(
    createdRaces.map((r) => createTokensForRace(r.id, eventDate))
  );

  return { eventId: event.id };
}

export async function updateEvent(
  eventId: string,
  input: { name: string; date: string; location?: string }
): Promise<void> {
  const db = getDb();
  await db
    .update(events)
    .set({ name: input.name, date: input.date, location: input.location ?? null })
    .where(eq(events.id, eventId));
}

/** Adds a race the event was created without (e.g. a year group that turned out to
 * be running after all). The (event, year, gender) unique constraint stops doubles. */
export async function addRaceToEvent(eventId: string, spec: RaceSpec): Promise<string> {
  const db = getDb();
  const [event] = await db.select({ date: events.date }).from(events).where(eq(events.id, eventId));
  if (!event) throw new Error("Event not found");
  const [race] = await db
    .insert(races)
    .values({ eventId, yearGroup: spec.yearGroup, gender: spec.gender, status: "open" })
    .returning({ id: races.id });
  await createTokensForRace(race.id, new Date(event.date));
  return race.id;
}

/** Today's date as YYYY-MM-DD in the league's time zone (UK), matching events.date. */
export function todayInLeague(now: Date = new Date()): string {
  return now.toLocaleDateString("en-CA", { timeZone: "Europe/London" });
}

/**
 * The event a teacher most likely wants on opening their school page: today's event,
 * else the next upcoming one, else the most recent past one. `date` is YYYY-MM-DD, so
 * string comparison is date comparison.
 */
export function pickCurrentEvent<T extends { date: string }>(
  allEvents: T[],
  today: string
): T | null {
  const sorted = [...allEvents].sort((a, b) => a.date.localeCompare(b.date));
  const upcoming = sorted.find((e) => e.date >= today);
  return upcoming ?? sorted[sorted.length - 1] ?? null;
}

/** "2026-10-03" -> "Sat 3 Oct 2026". Parsed as UTC so the day never shifts. */
export function formatEventDate(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}
