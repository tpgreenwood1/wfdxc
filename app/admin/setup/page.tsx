import Link from "next/link";
import { getDb } from "@/db/client";
import { seasons } from "@/db/schema";
import { GENDERS, YEAR_GROUPS } from "@/lib/events";
import { raceLabel } from "@/lib/races";
import { createEventAction, createSeasonAction, updateMinRacesAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function AdminSetupPage() {
  const db = getDb();
  const allSeasons = await db.select().from(seasons);

  return (
    <main className="mx-auto max-w-3xl space-y-8 p-4 sm:p-6">
      <h1 className="text-2xl font-bold">Setup</h1>

      <section id="new-event" className="space-y-2">
        <h2 className="text-lg font-semibold">New event</h2>
        {allSeasons.length === 0 ? (
          <p className="text-sm text-gray-600">Create a season first (below).</p>
        ) : (
          <form action={createEventAction} className="space-y-3 rounded border p-3">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <label className="text-sm">
                Season
                <select name="seasonId" className="mt-1 block min-h-[44px] w-full rounded border px-2">
                  {allSeasons.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                Date
                <input name="date" type="date" required className="mt-1 block min-h-[44px] w-full rounded border px-2" />
              </label>
              <label className="text-sm">
                Event name
                <input name="name" required placeholder="e.g. Race 2 — Park Lane" className="mt-1 block min-h-[44px] w-full rounded border px-2" />
              </label>
              <label className="text-sm">
                Location
                <input name="location" placeholder="Optional" className="mt-1 block min-h-[44px] w-full rounded border px-2" />
              </label>
            </div>
            <fieldset>
              <legend className="text-sm font-medium">Races at this event</legend>
              <p className="text-xs text-gray-500">
                Untick any that aren&apos;t running. You can add a race later from the event page.
              </p>
              <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-4">
                {YEAR_GROUPS.flatMap((yearGroup) =>
                  GENDERS.map((gender) => (
                    <label key={`${yearGroup}:${gender}`} className="flex min-h-[36px] items-center gap-2 text-sm">
                      <input type="checkbox" name="races" value={`${yearGroup}:${gender}`} defaultChecked />
                      {raceLabel({ yearGroup, gender })}
                    </label>
                  ))
                )}
              </div>
            </fieldset>
            <button className="min-h-[44px] rounded bg-gray-800 px-4 text-white" type="submit">
              Create event
            </button>
          </form>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Seasons</h2>
        <p className="text-sm text-gray-600">
          <strong>Min races</strong> is how many races a runner needs to appear in the season
          standings. Changing it updates the standings straight away — lower it if races get
          cancelled.
        </p>
        <ul className="divide-y rounded border">
          {allSeasons.map((season) => (
            <li key={season.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
              <span className="font-medium">{season.name}</span>
              <form action={updateMinRacesAction} className="flex items-center gap-2 text-sm">
                <input type="hidden" name="seasonId" value={season.id} />
                <label htmlFor={`min-${season.id}`}>Min races</label>
                <input
                  id={`min-${season.id}`}
                  type="number"
                  min={0}
                  inputMode="numeric"
                  name="minRacesRequired"
                  defaultValue={season.minRacesRequired}
                  className="min-h-[40px] w-16 rounded border px-2"
                />
                <button className="min-h-[40px] rounded bg-gray-100 px-3" type="submit">
                  Save
                </button>
              </form>
            </li>
          ))}
        </ul>
        <form action={createSeasonAction} className="flex gap-2">
          <input
            name="name"
            placeholder="New season, e.g. 2026–27"
            className="min-h-[44px] flex-1 rounded border px-2"
            required
          />
          <button className="min-h-[44px] rounded bg-gray-800 px-4 text-white" type="submit">
            Add season
          </button>
        </form>
      </section>

      <p className="text-sm text-gray-600">
        Schools and their teacher links are on the{" "}
        <Link className="text-blue-600 underline" href="/admin/schools">
          Schools
        </Link>{" "}
        page.
      </p>
    </main>
  );
}
