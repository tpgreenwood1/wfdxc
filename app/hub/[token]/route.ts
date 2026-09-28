import { NextResponse, type NextRequest } from "next/server";
import { resolveHubToken } from "@/lib/hubTokens";
import { getSchoolById } from "@/lib/schools";

export const dynamic = "force-dynamic";

/**
 * Per-event hub links predate the school home page. They still work as a bookmark —
 * they land on the school's page for that event — but they no longer unlock it: these
 * links never expire and get forwarded around, so they'd let anyone back in after the
 * school's code is regenerated. A device that isn't already unlocked gets the code gate.
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

  return NextResponse.redirect(
    new URL(`/school/${school.slug}?event=${ctx.eventId}`, request.url)
  );
}
