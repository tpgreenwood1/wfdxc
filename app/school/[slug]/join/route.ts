import { NextResponse, type NextRequest } from "next/server";
import { getSchoolBySlug } from "@/lib/schools";
import { grantSchoolAccess, isCorrectCode } from "@/lib/schoolAccess";

export const dynamic = "force-dynamic";

/** The one link the organiser sends each school for the whole season:
 * /school/[slug]/join?code=XXXXXX — opening it unlocks the school page on that device. */
export async function GET(
  request: NextRequest,
  { params }: { params: { slug: string } }
) {
  const school = await getSchoolBySlug(params.slug);
  if (!school) {
    return new NextResponse("School not found", { status: 404 });
  }

  const code = request.nextUrl.searchParams.get("code") ?? "";
  if (!isCorrectCode(school, code)) {
    return NextResponse.redirect(
      new URL(`/school/${school.slug}?codeError=1`, request.url)
    );
  }

  const response = NextResponse.redirect(new URL(`/school/${school.slug}`, request.url));
  grantSchoolAccess(school, response.cookies);
  return response;
}
