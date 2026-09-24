import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { events, schools, seasons } from "@/db/schema";
import {
  createEventAction,
  createSchoolAction,
  createSeasonAction,
  deleteEventAction,
  deleteSchoolAction,
  updateMinRacesAction,
} from "./actions";
import ConfirmDeleteButton from "./ConfirmDeleteButton";

export const dynamic = "force-dynamic";

export default async function AdminHomePage() {
  const db = getDb();
  const [allSeasons, allEvents, allSchools] = await Promise.all([
    db.select().from(seasons),
    db.select().from(events).orderBy(desc(events.date)),
    db.select().from(schools).orderBy(schools.name),
  ]);

  const eventsBySeason = new Map<string, typeof allEvents>();
  for (const event of allEvents) {
    const list = eventsBySeason.get(event.seasonId) ?? [];
    list.push(event);
    eventsBySeason.set(event.seasonId, list);
  }

  return (
    <main className="mx-auto max-w-3xl space-y-8 p-6">
      <h1 className="text-2xl font-bold">Admin</h1>

      <section>
        <h2 className="text-lg font-semibold">Schools</h2>
        <ul className="mt-1 space-y-1 text-sm text-gray-700">
          {allSchools.map((s) => (
            <li key={s.id} className="flex items-center gap-2">
              <span className="flex-1">{s.name}</span>
              <ConfirmDeleteButton
                action={deleteSchoolAction}
                fieldName="schoolId"
                fieldValue={s.id}
                confirmMessage={`Delete "${s.name}"? This can't be undone.`}
              />
            </li>
          ))}
        </ul>
        <form action={createSchoolAction} className="mt-2 flex gap-2">
          <input
            name="name"
            placeholder="School name"
            className="rounded border px-2 py-1"
            required
          />
          <button className="rounded bg-gray-800 px-3 py-1 text-white" type="submit">
            Add school
          </button>
        </form>
      </section>

      <section>
        <h2 className="text-lg font-semibold">Seasons</h2>
        <form action={createSeasonAction} className="mt-2 flex gap-2">
          <input
            name="name"
            placeholder="Season name"
            className="rounded border px-2 py-1"
            required
          />
          <button className="rounded bg-gray-800 px-3 py-1 text-white" type="submit">
            Add season
          </button>
        </form>

        <div className="mt-4 space-y-6">
          {allSeasons.map((season) => (
            <div key={season.id} className="rounded border p-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">{season.name}</h3>
                <form action={updateMinRacesAction} className="flex items-center gap-2 text-sm">
                  <input type="hidden" name="seasonId" value={season.id} />
                  <label>Min races required:</label>
                  <input
                    type="number"
                    name="minRacesRequired"
                    defaultValue={season.minRacesRequired}
                    className="w-16 rounded border px-1 py-0.5"
                  />
                  <button className="rounded bg-gray-200 px-2 py-0.5" type="submit">
                    Save
                  </button>
                </form>
              </div>

              <ul className="mt-2 space-y-1 text-sm">
                {(eventsBySeason.get(season.id) ?? []).map((event) => (
                  <li key={event.id} className="flex items-center gap-2">
                    <Link
                      className="flex-1 text-blue-600 underline"
                      href={`/admin/events/${event.id}`}
                    >
                      {event.name} — {event.date}
                    </Link>
                    <ConfirmDeleteButton
                      action={deleteEventAction}
                      fieldName="eventId"
                      fieldValue={event.id}
                      confirmMessage={`Delete "${event.name}" and all its races? This can't be undone.`}
                    />
                  </li>
                ))}
              </ul>

              <form action={createEventAction} className="mt-3 flex flex-wrap gap-2 text-sm">
                <input type="hidden" name="seasonId" value={season.id} />
                <input name="name" placeholder="Event name" className="rounded border px-2 py-1" required />
                <input name="date" type="date" className="rounded border px-2 py-1" required />
                <input name="location" placeholder="Location" className="rounded border px-2 py-1" />
                <button className="rounded bg-gray-800 px-3 py-1 text-white" type="submit">
                  Create event (auto-creates races + tokens)
                </button>
              </form>
            </div>
          ))}
        </div>
      </section>

      <section>
        <Link className="text-blue-600 underline" href="/admin/roster">
          Roster / merge tool
        </Link>
      </section>
    </main>
  );
}
