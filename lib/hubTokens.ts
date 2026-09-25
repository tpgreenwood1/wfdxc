import { randomUUID } from "crypto";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { events, eventSchoolTokens, schools } from "@/db/schema";
import { isUuid } from "./ids";

/**
 * Get-or-create is the only way these rows come into being — there's no bulk creation
 * at event-setup time (unlike submissionTokens). The unique(event_id, school_id)
 * constraint makes a concurrent double-create harmless: the loser's insert conflicts
 * and we just re-select the winner's row.
 */
export async function getOrCreateHubToken(
  eventId: string,
  schoolId: string
): Promise<string> {
  const db = getDb();

  const [existing] = await db
    .select({ token: eventSchoolTokens.token })
    .from(eventSchoolTokens)
    .where(
      and(
        eq(eventSchoolTokens.eventId, eventId),
        eq(eventSchoolTokens.schoolId, schoolId)
      )
    );
  if (existing) return existing.token;

  const [inserted] = await db
    .insert(eventSchoolTokens)
    .values({ eventId, schoolId })
    .onConflictDoNothing({
      target: [eventSchoolTokens.eventId, eventSchoolTokens.schoolId],
    })
    .returning({ token: eventSchoolTokens.token });
  if (inserted) return inserted.token;

  const [row] = await db
    .select({ token: eventSchoolTokens.token })
    .from(eventSchoolTokens)
    .where(
      and(
        eq(eventSchoolTokens.eventId, eventId),
        eq(eventSchoolTokens.schoolId, schoolId)
      )
    );
  return row.token;
}

export type HubTokenRow = { id: string; schoolId: string; token: string };

/** Hub token rows for every school in the league for this event, creating any that
 * don't exist yet — used to render the admin links grid's per-school hub link row. */
export async function getOrCreateHubTokensForEvent(
  eventId: string
): Promise<Map<string, HubTokenRow>> {
  const db = getDb();
  const allSchools = await db.select({ id: schools.id }).from(schools);
  await Promise.all(allSchools.map((s) => getOrCreateHubToken(eventId, s.id)));

  const rows = await db
    .select({
      id: eventSchoolTokens.id,
      schoolId: eventSchoolTokens.schoolId,
      token: eventSchoolTokens.token,
    })
    .from(eventSchoolTokens)
    .where(eq(eventSchoolTokens.eventId, eventId));

  return new Map(rows.map((r) => [r.schoolId, r]));
}

/** Invalidates a school's current hub link and issues a new one, without affecting
 * any other school's link. */
export async function regenerateHubToken(tokenId: string): Promise<string> {
  const db = getDb();
  const newToken = randomUUID();
  await db
    .update(eventSchoolTokens)
    .set({ token: newToken })
    .where(eq(eventSchoolTokens.id, tokenId));
  return newToken;
}

export type HubTokenContext = {
  eventId: string;
  eventName: string;
  eventDate: string;
  schoolId: string;
  schoolName: string;
};

export async function resolveHubToken(
  token: string
): Promise<HubTokenContext | null> {
  if (!isUuid(token)) return null;
  const db = getDb();
  const [row] = await db
    .select({
      eventId: eventSchoolTokens.eventId,
      eventName: events.name,
      eventDate: events.date,
      schoolId: eventSchoolTokens.schoolId,
      schoolName: schools.name,
    })
    .from(eventSchoolTokens)
    .innerJoin(events, eq(eventSchoolTokens.eventId, events.id))
    .innerJoin(schools, eq(eventSchoolTokens.schoolId, schools.id))
    .where(eq(eventSchoolTokens.token, token));

  return row ?? null;
}
