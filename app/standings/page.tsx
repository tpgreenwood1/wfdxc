import { desc } from "drizzle-orm";
import { getDb } from "@/db/client";
import { seasons } from "@/db/schema";
import { getSeasonStandings } from "@/lib/standings-query";
import type { Gender, YearGroup } from "@/lib/types";

export const dynamic = "force-dynamic";

const YEAR_GROUPS: YearGroup[] = ["reception", "y1", "y2", "y3", "y4", "y5", "y6"];
const GENDERS: Gender[] = ["boys", "girls"];

export default async function StandingsPage({
  searchParams,
}: {
  searchParams: { seasonId?: string; yearGroup?: string; gender?: string };
}) {
  const db = getDb();
  const allSeasons = await db.select().from(seasons);
  const seasonId = searchParams.seasonId ?? allSeasons[0]?.id;
  const yearGroup = (searchParams.yearGroup ?? "y3") as YearGroup;
  const gender = (searchParams.gender ?? "boys") as Gender;

  const standings = seasonId
    ? await getSeasonStandings(seasonId, yearGroup, gender)
    : null;

  return (
    <main className="mx-auto max-w-2xl space-y-4 p-6">
      <h1 className="text-2xl font-bold">Season standings</h1>

      <form className="flex flex-wrap gap-2 text-sm" method="get">
        <select name="seasonId" defaultValue={seasonId} className="rounded border px-2 py-1">
          {allSeasons.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <select name="yearGroup" defaultValue={yearGroup} className="rounded border px-2 py-1">
          {YEAR_GROUPS.map((yg) => (
            <option key={yg} value={yg}>
              {yg.toUpperCase()}
            </option>
          ))}
        </select>
        <select name="gender" defaultValue={gender} className="rounded border px-2 py-1">
          {GENDERS.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>
        <button className="rounded bg-gray-800 px-3 py-1 text-white" type="submit">
          View
        </button>
      </form>

      {standings && (
        <>
          <section>
            <h2 className="font-semibold">Qualified</h2>
            <table className="mt-1 w-full text-sm">
              <thead>
                <tr className="text-left">
                  <th className="py-1">Runner</th>
                  <th className="py-1">Races</th>
                  <th className="py-1">Total</th>
                </tr>
              </thead>
              <tbody>
                {standings.qualified.map((r, i) => (
                  <tr key={r.runnerId} className="border-t">
                    <td className="py-1">
                      {i + 1}. {r.runnerName}
                    </td>
                    <td className="py-1">{r.racesCompleted}</td>
                    <td className="py-1">{r.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {standings.notYetQualified.length > 0 && (
            <section>
              <h2 className="font-semibold text-gray-600">Not yet qualified</h2>
              <ul className="mt-1 text-sm text-gray-600">
                {standings.notYetQualified.map((r) => (
                  <li key={r.runnerId}>
                    {r.runnerName} — {r.racesCompleted} race(s)
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </main>
  );
}
