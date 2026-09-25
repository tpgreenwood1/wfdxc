import { NextRequest, NextResponse } from "next/server";
import { searchRunners } from "@/lib/runners";

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q") ?? "";
  const includeRetired = request.nextUrl.searchParams.get("includeRetired") === "true";
  const matches = await searchRunners(q, { includeRetired });
  return NextResponse.json(matches);
}
