import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { schools, submissionTokens, races } from "@/db/schema";
import { getRaceResultsForAdmin } from "@/lib/results";
import { isDiverged } from "@/lib/publish";
import RaceResultsTable from "./RaceResultsTable";
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

  const [resultRows, tokens, diverged] = await Promise.all([
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
  ]);

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">
          {race.yearGroup.toUpperCase()} · {race.gender}
        </h1>
        <p className="text-gray-600">Status: {race.status}</p>
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
              <button className="rounded bg-gray-800 px-3 py-1 text-sm text-white" type="submit">
                Mark {status}
              </button>
            </form>
          ))}
      </div>

      <section>
        <h2 className="font-semibold">Results</h2>
        <RaceResultsTable raceId={race.id} initialRows={resultRows} />
      </section>

      <section>
        <h2 className="font-semibold">Submission links</h2>
        <ul className="mt-1 space-y-1 text-sm">
          {tokens.map((t) => (
            <li key={t.id} className="flex items-center gap-2">
              <span className="w-32">{t.schoolName}</span>
              <code className="flex-1 truncate text-xs">/submit/{t.token}</code>
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
