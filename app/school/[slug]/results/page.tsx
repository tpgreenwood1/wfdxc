import Link from "next/link";
import { getDb } from "@/db/client";
import { events } from "@/db/schema";
import { loadSchoolForPage } from "@/lib/schoolAccess";
import { formatEventDate, pickCurrentEvent, todayInLeague } from "@/lib/events";
import { getSchoolSeasonResults, type SchoolRaceResult } from "@/lib/public-results";
import { raceLabel, sortRaces } from "@/lib/races";
import CodeGate from "../CodeGate";

export const dynamic = "force-dynamic";

function ordinal(n: number): string {
  const suffix = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (suffix[(v - 20) % 10] || suffix[v] || suffix[0]);
}

export default async function SchoolResultsPage({ params }: { params: { slug: string } }) {
  const { school, hasAccess } = await loadSchoolForPage(params.slug);
  if (!hasAccess) return <CodeGate slug={school.slug} />;

  const db = getDb();
  const allEvents = await db.select().from(events);
  const current = pickCurrentEvent(allEvents, todayInLeague());
  const results = current ? await getSchoolSeasonResults(school.id, current.seasonId) : [];

  const byEvent = new Map<string, SchoolRaceResult[]>();
  for (const r of results) {
    const list = byEvent.get(r.eventId) ?? [];
    list.push(r);
    byEvent.set(r.eventId, list);
  }
  const eventGroups = [...byEvent.values()].sort((a, b) =>
    b[0].eventDate.localeCompare(a[0].eventDate)
  );

  return (
    <div className="space-y-6">
      {eventGroups.length === 0 ? (
        <p className="rounded-lg bg-gray-50 p-4 text-gray-600">
          No results published yet this season. Results appear here once the scorer
          closes each race.
        </p>
      ) : (
        eventGroups.map((group) => (
          <section key={group[0].eventId} className="space-y-2">
            <h2 className="font-semibold">
              {group[0].eventName}{" "}
              <span className="font-normal text-gray-500">
                · {formatEventDate(group[0].eventDate)}
              </span>
            </h2>
            {sortRaces(group).map((race) => (
              <Link
                key={race.raceId}
                href={`/results/${race.raceId}`}
                className="block rounded-lg border p-3"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-semibold">{raceLabel(race)}</span>
                  {race.teamRank !== null && (
                    <span className="text-sm font-medium text-blue-700">
                      Team {ordinal(race.teamRank)} of {race.teamCount}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-sm text-gray-700">
                  {race.runners.map((r) => `${ordinal(r.position)} ${r.runnerName}`).join(" · ")}
                </p>
                <p className="mt-1 text-sm text-blue-600">Full results →</p>
              </Link>
            ))}
          </section>
        ))
      )}

      <section className="grid grid-cols-2 gap-2">
        <Link
          href="/results"
          className="flex min-h-[48px] items-center justify-center rounded-lg border text-blue-700"
        >
          All league results
        </Link>
        <Link
          href="/standings"
          className="flex min-h-[48px] items-center justify-center rounded-lg border text-blue-700"
        >
          Season standings
        </Link>
      </section>
    </div>
  );
}
