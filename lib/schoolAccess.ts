import { timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { getSchoolBySlug, normaliseAccessCode, type School } from "./schools";

/**
 * Teacher access to /school/[slug] is a plain cookie holding the school's current
 * access code, compared against the DB on every request. No signing secret needed:
 * the cookie is only as good as the code itself, and regenerating the code (admin)
 * immediately invalidates every device that was unlocked with the old one.
 */
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;
export const LAST_SCHOOL_COOKIE = "xc_last_school";

function accessCookieName(schoolId: string) {
  return `xc_school_${schoolId}`;
}

function codesMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

/** Checks a code the teacher typed (or that came in on their join link). */
export function isCorrectCode(school: School, input: string): boolean {
  return codesMatch(normaliseAccessCode(input), school.accessCode);
}

export function hasSchoolAccess(school: School): boolean {
  const value = cookies().get(accessCookieName(school.id))?.value;
  return !!value && codesMatch(value, school.accessCode);
}

/** For server actions: resolves the school and throws unless this device is unlocked. */
export async function requireSchoolAccess(slug: string): Promise<School> {
  const school = await getSchoolBySlug(slug);
  if (!school || !hasSchoolAccess(school)) {
    throw new Error("Your access to this school has expired — reload the page and enter your school code.");
  }
  return school;
}

/** For school pages: 404s on an unknown slug; hasAccess=false means render the code
 * gate instead of the page content. */
export async function loadSchoolForPage(
  slug: string
): Promise<{ school: School; hasAccess: boolean }> {
  const school = await getSchoolBySlug(slug);
  if (!school) notFound();
  return { school, hasAccess: hasSchoolAccess(school) };
}

type CookieWriter = {
  set: (name: string, value: string, options: Record<string, unknown>) => unknown;
};

/** Only callable from a server action or route handler (Next 14 restriction on
 * setting cookies). Route handlers returning their own NextResponse should pass
 * `response.cookies` so the cookies ride on that response. */
export function grantSchoolAccess(
  school: School,
  store: CookieWriter = cookies()
): void {
  const secure = process.env.NODE_ENV === "production";
  store.set(accessCookieName(school.id), school.accessCode, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    maxAge: ONE_YEAR_SECONDS,
    path: "/",
  });
  // Not a credential — only drives the "My school" shortcut on the home page/nav.
  store.set(LAST_SCHOOL_COOKIE, school.slug, {
    secure,
    sameSite: "lax",
    maxAge: ONE_YEAR_SECONDS,
    path: "/",
  });
}
