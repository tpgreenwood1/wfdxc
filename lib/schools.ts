import { randomInt } from "crypto";
import { eq, like } from "drizzle-orm";
import { getDb } from "@/db/client";
import { schools } from "@/db/schema";

// No 0/O, 1/I/L — codes get read out loud and typed on a phone keyboard.
export const ACCESS_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const ACCESS_CODE_LENGTH = 6;

/** Must stay in step with the backfill in db/migrations/0006_school_slug_access_code.sql. */
export function slugify(name: string): string {
  const slug = name
    .replace(/'/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "school";
}

export function generateAccessCode(): string {
  let code = "";
  for (let i = 0; i < ACCESS_CODE_LENGTH; i++) {
    code += ACCESS_CODE_ALPHABET[randomInt(ACCESS_CODE_ALPHABET.length)];
  }
  return code;
}

/** Upper-case, strip spaces — so "k7p 4qx" typed on a phone still matches. */
export function normaliseAccessCode(input: string): string {
  return input.replace(/\s+/g, "").toUpperCase();
}

/** Picks the first free slug among base, base-2, base-3… given the slugs already
 * taken that start with base. */
export function uniqueSlug(base: string, taken: Iterable<string>): string {
  const takenSet = new Set(taken);
  if (!takenSet.has(base)) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base}-${n}`;
    if (!takenSet.has(candidate)) return candidate;
  }
}

export type School = typeof schools.$inferSelect;

/** The only way schools should be created (admin action and seed script), so every
 * school gets a unique slug and an access code. */
export async function createSchool(name: string): Promise<School> {
  const db = getDb();
  const base = slugify(name);
  const existing = await db
    .select({ slug: schools.slug })
    .from(schools)
    .where(like(schools.slug, `${base}%`));
  const slug = uniqueSlug(
    base,
    existing.map((s) => s.slug)
  );
  const [row] = await db
    .insert(schools)
    .values({ name: name.trim(), slug, accessCode: generateAccessCode() })
    .returning();
  return row;
}

export async function getSchoolBySlug(slug: string): Promise<School | null> {
  const db = getDb();
  const [row] = await db.select().from(schools).where(eq(schools.slug, slug));
  return row ?? null;
}

export async function getSchoolById(id: string): Promise<School | null> {
  const db = getDb();
  const [row] = await db.select().from(schools).where(eq(schools.id, id));
  return row ?? null;
}

/** Issues a new code, which also logs out every device unlocked with the old one
 * (see lib/schoolAccess.ts). */
export async function regenerateAccessCode(schoolId: string): Promise<string> {
  const db = getDb();
  const accessCode = generateAccessCode();
  await db.update(schools).set({ accessCode }).where(eq(schools.id, schoolId));
  return accessCode;
}

/** Renames a school. The slug is deliberately left alone so teacher links and
 * bookmarks keep working (see db/schema.ts). Published results keep the name they
 * were published with. */
export async function renameSchool(schoolId: string, name: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("School name can't be empty");
  const db = getDb();
  await db.update(schools).set({ name: trimmed }).where(eq(schools.id, schoolId));
}

/** The season-long "teacher link": unlocks and opens the school home page. */
export function teacherLinkPath(school: { slug: string; accessCode: string }): string {
  return `/school/${school.slug}/join?code=${school.accessCode}`;
}

/** Ready-to-send text for a teacher who's lost their link or code. `{url}` is filled
 * in with the absolute link by ShareLinkButton. */
export function teacherLinkMessage(school: { name: string; accessCode: string }): string {
  return `Here's the ${school.name} cross-country link for entering results: {url}\nIf it asks for a code, it's ${school.accessCode}.`;
}

/** Reminder for a school that hasn't finished entering an event's results. */
export function chaseMessage(
  school: { name: string; accessCode: string },
  eventName: string,
  outstanding: string[]
): string {
  const races =
    outstanding.length > 0 && outstanding.length <= 6
      ? ` We haven't got anything yet for: ${outstanding.join(", ")}.`
      : "";
  return `Hi ${school.name} — a reminder to enter your runners' places for ${eventName}.${races}\nTap "Race done" on each race once it's entered (or "No runners" if nobody ran), or "We're done" at the end.\n{url}\n(Code if asked: ${school.accessCode})`;
}
