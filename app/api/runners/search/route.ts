import { NextRequest, NextResponse } from "next/server";
import { searchRunners } from "@/lib/runners";

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q") ?? "";
  const matches = await searchRunners(q);
  return NextResponse.json(matches);
}
