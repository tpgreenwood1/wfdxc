import { NextResponse, type NextRequest } from "next/server";
import { resolveHubToken } from "@/lib/hubTokens";
import { grantSchoolAccess } from "@/lib/schoolAccess";
import { getSchoolById } from "@/lib/schools";

export const dynamic = "force-dynamic";

/**
 * Per-event hub links predate the school home page. They still work: a valid hub
 * token proves which school the teacher is from, so it unlocks that school's home page
 * on this device and lands them on the event it was sent for.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { token: string } }
) {
  const ctx = await resolveHubToken(params.token);
  const school = ctx ? await getSchoolById(ctx.schoolId) : null;
  if (!ctx || !school) {
    return new NextResponse(
      "This link isn't valid any more — ask the league organiser for your school's link.",
      { status: 404 }
    );
  }

  const response = NextResponse.redirect(
    new URL(`/school/${school.slug}?event=${ctx.eventId}`, request.url)
  );
  grantSchoolAccess(school, response.cookies);
  return response;
}
