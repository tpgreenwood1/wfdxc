import { getDb } from "@/db/client";
import { events, races } from "@/db/schema";
import { createTokensForRace } from "./tokens";
import type { Gender, YearGroup } from "./types";

const YEAR_GROUPS: YearGroup[] = [
  "reception",
  "y1",
  "y2",
  "y3",
  "y4",
  "y5",
  "y6",
];
const GENDERS: Gender[] = ["boys", "girls"];

/**
 * Creates the event plus one race per (year_group x gender) combination, each
 * 'open' and pre-loaded with a submission token for every school — so links are
 * ready to distribute the moment the event exists.
 */
export async function createEvent(input: {
  seasonId: string;
  name: string;
  date: string; // YYYY-MM-DD
  location?: string;
}): Promise<{ eventId: string }> {
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
      YEAR_GROUPS.flatMap((yearGroup) =>
        GENDERS.map((gender) => ({
          eventId: event.id,
          yearGroup,
          gender,
          status: "open" as const,
        }))
      )
    )
    .returning({ id: races.id });

  const eventDate = new Date(input.date);
  await Promise.all(
    createdRaces.map((r) => createTokensForRace(r.id, eventDate))
  );

  return { eventId: event.id };
}
