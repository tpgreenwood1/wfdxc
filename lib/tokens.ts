import { randomUUID } from "crypto";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { races, schools, submissionTokens } from "@/db/schema";
import { isUuid } from "./ids";

const TOKEN_VALIDITY_DAYS = 7;

/** One token per (race, school) for every school in the league, generated when the
 * race is created so links can be distributed ahead of the meet. */
export async function createTokensForRace(
  raceId: string,
  eventDate: Date
): Promise<void> {
  const db = getDb();
  const allSchools = await db.select({ id: schools.id }).from(schools);
  if (allSchools.length === 0) return;

  const expiresAt = new Date(
    eventDate.getTime() + TOKEN_VALIDITY_DAYS * 24 * 60 * 60 * 1000
  );

  await db.insert(submissionTokens).values(
    allSchools.map((s) => ({ raceId, schoolId: s.id, expiresAt }))
  );
}

/** Fetches a school's submission token for a race, creating it if it doesn't exist yet
 * (e.g. a race added to the event after the hub link was already sent out — hub-page
 * navigation must stay valid without requiring tokens to be pre-generated). */
export async function getOrCreateSubmissionToken(
  raceId: string,
  schoolId: string,
  eventDate: Date
): Promise<string> {
  const db = getDb();

  const [existing] = await db
    .select({ token: submissionTokens.token })
    .from(submissionTokens)
    .where(
      and(
        eq(submissionTokens.raceId, raceId),
        eq(submissionTokens.schoolId, schoolId)
      )
    );
  if (existing) return existing.token;

  const expiresAt = new Date(
    eventDate.getTime() + TOKEN_VALIDITY_DAYS * 24 * 60 * 60 * 1000
  );

  const [inserted] = await db
    .insert(submissionTokens)
    .values({ raceId, schoolId, expiresAt })
    .onConflictDoNothing({
      target: [submissionTokens.raceId, submissionTokens.schoolId],
    })
    .returning({ token: submissionTokens.token });
  if (inserted) return inserted.token;

  const [row] = await db
    .select({ token: submissionTokens.token })
    .from(submissionTokens)
    .where(
      and(
        eq(submissionTokens.raceId, raceId),
        eq(submissionTokens.schoolId, schoolId)
      )
    );
  return row.token;
}

/** Invalidates the old link and issues a new one, e.g. if a link was leaked or a
 * teacher lost it and it needs resending. */
export async function regenerateToken(tokenId: string): Promise<string> {
  const db = getDb();
  const newToken = randomUUID();
  await db
    .update(submissionTokens)
    .set({ token: newToken })
    .where(eq(submissionTokens.id, tokenId));
  return newToken;
}

export type TokenContext = {
  tokenId: string;
  raceId: string;
  schoolId: string;
  schoolName: string;
  yearGroup: string;
  gender: string;
  raceStatus: "open" | "closed" | "cancelled";
  isExpired: boolean;
  isEditable: boolean;
};

/** Valid while the race is 'open' AND the token hasn't expired; becomes read-only
 * once the race is closed (or the token itself has expired) regardless of status. */
export async function resolveToken(token: string): Promise<TokenContext | null> {
  if (!isUuid(token)) return null;
  const db = getDb();
  const [row] = await db
    .select({
      tokenId: submissionTokens.id,
      raceId: submissionTokens.raceId,
      schoolId: submissionTokens.schoolId,
      schoolName: schools.name,
      expiresAt: submissionTokens.expiresAt,
      yearGroup: races.yearGroup,
      gender: races.gender,
      raceStatus: races.status,
    })
    .from(submissionTokens)
    .innerJoin(schools, eq(submissionTokens.schoolId, schools.id))
    .innerJoin(races, eq(submissionTokens.raceId, races.id))
    .where(eq(submissionTokens.token, token));

  if (!row) return null;

  const isExpired = row.expiresAt.getTime() < Date.now();
  const isEditable = row.raceStatus === "open" && !isExpired;

  return {
    tokenId: row.tokenId,
    raceId: row.raceId,
    schoolId: row.schoolId,
    schoolName: row.schoolName,
    yearGroup: row.yearGroup,
    gender: row.gender,
    raceStatus: row.raceStatus,
    isExpired,
    isEditable,
  };
}
