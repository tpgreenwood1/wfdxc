import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { events, seasons } from "@/db/schema";
import HelpButton from "@/app/components/HelpButton";

export const dynamic = "force-dynamic";

export default async function ResultsIndexPage() {
  const db = getDb();
  const [allSeasons, allEvents] = await Promise.all([
    db.select().from(seasons),
    db.select().from(events).orderBy(desc(events.date)),
  ]);

  const seasonName = new Map(allSeasons.map((s) => [s.id, s.name]));
  const eventsBySeason = new Map<string, typeof allEvents>();
  for (const event of allEvents) {
    const list = eventsBySeason.get(event.seasonId) ?? [];
    list.push(event);
    eventsBySeason.set(event.seasonId, list);
  }

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Results</h1>
        <HelpButton topics={["results", "scoring"]} />
      </div>

      {allEvents.length === 0 && (
        <p className="text-gray-600">No events yet.</p>
      )}

      {[...eventsBySeason.entries()].map(([seasonId, seasonEvents]) => (
        <section key={seasonId}>
          <h2 className="font-semibold text-gray-700">
            {seasonName.get(seasonId) ?? "Season"}
          </h2>
          <ul className="mt-1 space-y-1">
            {seasonEvents.map((event) => (
              <li key={event.id}>
                <Link className="text-blue-600 underline" href={`/results/${event.id}`}>
                  {event.name} — {event.date}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </main>
  );
}
