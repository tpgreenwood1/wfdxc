import Link from "next/link";
import { desc, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { events, races, seasons } from "@/db/schema";
import { formatEventDate, todayInLeague } from "@/lib/events";
import ConfirmDeleteButton from "../ConfirmDeleteButton";
import { deleteEventAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function AdminEventsPage() {
  const db = getDb();
  const [allSeasons, allEvents, raceCounts] = await Promise.all([
    db.select().from(seasons),
    db.select().from(events).orderBy(desc(events.date)),
    db
      .select({
        eventId: races.eventId,
        total: sql<number>`count(*)::int`,
        closed: sql<number>`count(*) filter (where ${races.status} = 'closed')::int`,
        cancelled: sql<number>`count(*) filter (where ${races.status} = 'cancelled')::int`,
      })
      .from(races)
      .groupBy(races.eventId),
  ]);
  const countsByEvent = new Map(raceCounts.map((c) => [c.eventId, c]));
  const today = todayInLeague();

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-4 sm:p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Events</h1>
        <Link href="/admin/setup#new-event" className="rounded bg-gray-800 px-3 py-2 text-sm text-white">
          + New event
        </Link>
      </div>

      {allSeasons.length === 0 && (
        <p className="text-gray-600">
          No seasons yet — create one on the{" "}
          <Link className="text-blue-600 underline" href="/admin/setup">
            Setup
          </Link>{" "}
          page.
        </p>
      )}

      {allSeasons.map((season) => {
        const seasonEvents = allEvents.filter((e) => e.seasonId === season.id);
        return (
          <section key={season.id}>
            <h2 className="font-semibold text-gray-700">{season.name}</h2>
            {seasonEvents.length === 0 ? (
              <p className="text-sm text-gray-500">No events yet.</p>
            ) : (
              <ul className="mt-1 divide-y rounded border">
                {seasonEvents.map((event) => {
                  const c = countsByEvent.get(event.id);
                  const live = (c?.total ?? 0) - (c?.cancelled ?? 0);
                  return (
                    <li key={event.id} className="flex flex-wrap items-center gap-2 p-3">
                      <Link href={`/admin/events/${event.id}`} className="min-w-0 flex-1">
                        <span className="font-medium text-blue-700 underline">{event.name}</span>
                        {event.date === today && (
                          <span className="ml-2 rounded bg-green-100 px-1.5 text-xs text-green-800">
                            Today
                          </span>
                        )}
                        <span className="block text-sm text-gray-600">
                          {formatEventDate(event.date)}
                          {event.location && ` · ${event.location}`} · {c?.closed ?? 0}/{live}{" "}
                          races finalised
                        </span>
                      </Link>
                      <ConfirmDeleteButton
                        action={deleteEventAction}
                        fieldName="eventId"
                        fieldValue={event.id}
                        confirmMessage={`Delete "${event.name}" and all its races? Only possible while no results have been entered.`}
                      />
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}
    </main>
  );
}
