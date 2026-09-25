import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { schools, submissionTokens, races } from "@/db/schema";
import { getRaceResultsForAdmin } from "@/lib/results";
import { isDiverged } from "@/lib/publish";
import { computeTeamResults } from "@/lib/scoring";
import RaceResultsTable from "./RaceResultsTable";
import CopyLinkButton from "../../events/[eventId]/links/CopyLinkButton";
import StatusBadge from "@/app/components/StatusBadge";
import ConfirmSubmitButton from "@/app/components/ConfirmSubmitButton";
import { regenerateTokenAction, republishAction, setStatusAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function RacePage({
  params,
}: {
  params: { raceId: string };
}) {
  const db = getDb();
  const [race] = await db.select().from(races).where(eq(races.id, params.raceId));
  if (!race) notFound();

  const [resultRows, tokens, diverged, allSchools] = await Promise.all([
    getRaceResultsForAdmin(params.raceId),
    db
      .select({
        id: submissionTokens.id,
        token: submissionTokens.token,
        expiresAt: submissionTokens.expiresAt,
        schoolName: schools.name,
      })
      .from(submissionTokens)
      .innerJoin(schools, eq(submissionTokens.schoolId, schools.id))
      .where(eq(submissionTokens.raceId, params.raceId)),
    race.status === "closed" ? isDiverged(params.raceId) : Promise.resolve(false),
    db.select({ id: schools.id, name: schools.name }).from(schools).orderBy(schools.name),
  ]);

  const teams = computeTeamResults(resultRows);

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">
          {race.yearGroup.toUpperCase()} · {race.gender}
        </h1>
        <p className="text-gray-600">
          Status: <StatusBadge status={race.status} />
        </p>
        <a href="/admin/roster" className="text-sm text-blue-600 underline">
          Roster / merge tool
        </a>
        {diverged && (
          <div className="mt-2 flex items-center gap-3 rounded bg-amber-200 p-2 text-amber-900">
            <span>Live results differ from the published snapshot.</span>
            <form action={republishAction}>
              <input type="hidden" name="raceId" value={race.id} />
              <button className="rounded bg-amber-900 px-2 py-1 text-white" type="submit">
                Republish
              </button>
            </form>
          </div>
        )}
      </div>

      <div className="flex gap-2">
        {(["open", "closed", "cancelled"] as const)
          .filter((s) => s !== race.status)
          .map((status) => (
            <form action={setStatusAction} key={status}>
              <input type="hidden" name="raceId" value={race.id} />
              <input type="hidden" name="status" value={status} />
              <ConfirmSubmitButton
                confirmMessage={`Mark this race as ${status}?`}
                className="rounded bg-gray-800 px-3 py-1 text-sm text-white"
              >
                Mark {status}
              </ConfirmSubmitButton>
            </form>
          ))}
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-[1fr_260px] md:items-start">
        <section>
          <h2 className="font-semibold">Results</h2>
          <RaceResultsTable raceId={race.id} initialRows={resultRows} allSchools={allSchools} />
        </section>

        <section className="rounded border p-3">
          <h2 className="font-semibold">Team standings</h2>
          <p className="text-xs text-gray-500">
            Live from current results — {race.status === "closed" ? "may differ from the published snapshot" : "updates as results are entered"}.
          </p>
          <table className="mt-2 w-full text-sm">
            <thead>
              <tr className="text-left">
                <th className="py-1">Rank</th>
                <th className="py-1">School</th>
                <th className="py-1">Scorers</th>
                <th className="py-1">Pts</th>
              </tr>
            </thead>
            <tbody>
              {teams.map((t) => (
                <tr key={t.schoolId} className="border-t">
                  <td className="py-1">{t.rank}</td>
                  <td className="py-1">{t.schoolName}</td>
                  <td className="py-1">{t.scoringCount}</td>
                  <td className="py-1">{t.scoreSum}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {teams.length === 0 && (
            <p className="mt-2 text-sm text-gray-500">No results yet.</p>
          )}
        </section>
      </div>

      <section>
        <h2 className="font-semibold">Submission links</h2>
        <ul className="mt-1 space-y-1 text-sm">
          {tokens.map((t) => (
            <li key={t.id} className="flex items-center gap-2">
              <span className="w-32">{t.schoolName}</span>
              <CopyLinkButton path={`/submit/${t.token}`} />
              <form action={regenerateTokenAction}>
                <input type="hidden" name="raceId" value={race.id} />
                <input type="hidden" name="tokenId" value={t.id} />
                <button className="rounded bg-gray-200 px-2 py-0.5 text-xs" type="submit">
                  Regenerate
                </button>
              </form>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
