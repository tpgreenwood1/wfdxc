import { NextResponse, type NextRequest } from "next/server";
import { getEventExport, sharedLabel } from "@/lib/eventExport";

export const dynamic = "force-dynamic";

function csvCell(value: string | number): string {
  const s = String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(rows: (string | number)[][]): string {
  // Leading BOM so Excel opens accented names (Zoë) correctly.
  return "﻿" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

/**
 * CSV download of an event's results, from live data (works before finalising too).
 * ?kind=individual (default) — one row per runner; ?kind=teams — one row per team.
 * Lives under /admin so the basic-auth middleware covers it.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { eventId: string } }
) {
  const data = await getEventExport(params.eventId);
  if (!data) return new NextResponse("Event not found", { status: 404 });
  const kind = request.nextUrl.searchParams.get("kind") === "teams" ? "teams" : "individual";
  const { event } = data;
  const status = (s: string) => (s === "closed" ? "Finalised" : "Provisional");

  const rows: (string | number)[][] = [];
  if (kind === "individual") {
    rows.push(["Event", "Date", "Race", "Status", "Position", "Runner", "School"]);
    for (const race of data.races) {
      const pos = sharedLabel(race.individual.map((r) => r.position));
      for (const r of race.individual) {
        rows.push([event.name, event.date, race.label, status(race.status), pos(r.position), r.runnerName, r.schoolName]);
      }
    }
  } else {
    rows.push(["Event", "Date", "Race", "Status", "Team place", "School", "Runners counted", "Points"]);
    for (const race of data.races) {
      const rank = sharedLabel(race.teams.map((t) => t.rank));
      for (const t of race.teams) {
        rows.push([event.name, event.date, race.label, status(race.status), rank(t.rank), t.schoolName, t.scoringCount, t.scoreSum]);
      }
    }
  }

  const base = `${event.date}-${event.name}`.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "");
  return new NextResponse(toCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${base}-${kind}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
