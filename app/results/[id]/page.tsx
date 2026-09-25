import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq, isNotNull, ne } from "drizzle-orm";
import { getDb } from "@/db/client";
import { events, races } from "@/db/schema";
import { getPublishedRaceResults } from "@/lib/public-results";
import { isUuid } from "@/lib/ids";
import { sortRaces } from "@/lib/raceLabels";
import HelpButton from "@/app/components/HelpButton";

export const dynamic = "force-dynamic";

// A single [id] segment serves both /results/[eventId] and /results/[raceId] from
// the spec — Next.js forbids two differently-named dynamic segments as siblings, and
// both ids are plain UUIDs from different tables, so we disambiguate by lookup order.
export default async function ResultsPage({ params }: { params: { id: string } }) {
  if (!isUuid(params.id)) notFound();
  const db = getDb();

  const [race] = await db.select().from(races).where(eq(races.id, params.id));
  if (race) {
    // A race reopened for corrections keeps its last published results (they still
    // count in standings); a cancelled one has had its snapshot removed.
    if (race.status === "cancelled" || race.publishedAt === null) notFound();
    return (
      <RaceResults
        raceId={race.id}
        yearGroup={race.yearGroup}
        gender={race.gender}
        beingCorrected={race.status === "open"}
      />
    );
  }

  const [event] = await db.select().from(events).where(eq(events.id, params.id));
  if (event) {
    return <EventRaceList eventId={event.id} eventName={event.name} eventDate={event.date} />;
  }

  notFound();
}

async function EventRaceList({
  eventId,
  eventName,
  eventDate,
}: {
  eventId: string;
  eventName: string;
  eventDate: string;
}) {
  const db = getDb();
  const closedRaces = sortRaces(
    await db
      .select()
      .from(races)
      .where(
        and(
          eq(races.eventId, eventId),
          ne(races.status, "cancelled"),
          isNotNull(races.publishedAt)
        )
      )
  );

  return (
    <main className="mx-auto max-w-2xl p-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">
          {eventName} — {eventDate}
        </h1>
        <HelpButton topics={["results", "scoring"]} />
      </div>
      <ul className="mt-4 space-y-1">
        {closedRaces.map((race) => (
          <li key={race.id}>
            <Link className="text-blue-600 underline" href={`/results/${race.id}`}>
              {race.yearGroup.toUpperCase()} · {race.gender}
            </Link>
          </li>
        ))}
        {closedRaces.length === 0 && (
          <p className="text-gray-600">No results published yet.</p>
        )}
      </ul>
    </main>
  );
}

async function RaceResults({
  raceId,
  yearGroup,
  gender,
  beingCorrected,
}: {
  raceId: string;
  yearGroup: string;
  gender: string;
  beingCorrected: boolean;
}) {
  const { individual, teams } = await getPublishedRaceResults(raceId);
  // Shared places (accepted ties, equal team scores) show as "=5".
  const shared = (values: number[]) => {
    const counts = new Map<number, number>();
    for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
    return (v: number) => ((counts.get(v) ?? 0) > 1 ? `=${v}` : String(v));
  };
  const showPosition = shared(individual.map((r) => r.position));
  const showRank = shared(teams.map((t) => t.rank));

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">
          {yearGroup.toUpperCase()} · {gender}
        </h1>
        <HelpButton topics={["results", "scoring"]} />
      </div>

      {beingCorrected && (
        <p className="rounded bg-amber-100 p-3 text-sm text-amber-900">
          The scorer is correcting these results — they may change shortly.
        </p>
      )}

      <section>
        <h2 className="font-semibold">Individual results</h2>
        <table className="mt-1 w-full text-sm">
          <thead>
            <tr className="text-left">
              <th className="py-1">Pos</th>
              <th className="py-1">Runner</th>
              <th className="py-1">School</th>
            </tr>
          </thead>
          <tbody>
            {individual.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="py-1">{showPosition(r.position)}</td>
                <td className="py-1">{r.runnerName}</td>
                <td className="py-1">{r.schoolName}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h2 className="font-semibold">Team results</h2>
        <table className="mt-1 w-full text-sm">
          <thead>
            <tr className="text-left">
              <th className="py-1">Rank</th>
              <th className="py-1">School</th>
              <th className="py-1">Scorers</th>
              <th className="py-1">Points</th>
            </tr>
          </thead>
          <tbody>
            {teams.map((t) => (
              <tr key={t.id} className="border-t">
                <td className="py-1">{showRank(t.rank)}</td>
                <td className="py-1">{t.schoolName}</td>
                <td className="py-1">{t.scoringCount}</td>
                <td className="py-1">{t.scoreSum}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
