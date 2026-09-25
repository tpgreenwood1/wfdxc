import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { races } from "@/db/schema";
import { resolveToken } from "@/lib/tokens";
import { getOrCreateHubToken } from "@/lib/hubTokens";
import { getResultsForSchoolInRace, getSchoolRoster } from "@/lib/results";
import SubmitForm from "@/app/components/SubmitForm";
import { removeResult, renameRunnerAction, saveResult, searchOtherSchoolsAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function SubmitPage({
  params,
}: {
  params: { token: string };
}) {
  const ctx = await resolveToken(params.token);
  if (!ctx) notFound();

  const db = getDb();
  const [existingResults, roster, [race]] = await Promise.all([
    getResultsForSchoolInRace(ctx.raceId, ctx.schoolId),
    getSchoolRoster(ctx.schoolId),
    db.select({ eventId: races.eventId }).from(races).where(eq(races.id, ctx.raceId)),
  ]);
  const hubToken = race ? await getOrCreateHubToken(race.eventId, ctx.schoolId) : null;

  return (
    <main className="mx-auto max-w-md p-4">
      {hubToken && (
        <Link className="text-sm text-blue-600 underline" href={`/hub/${hubToken}`}>
          &larr; Back to all races
        </Link>
      )}
      <h1 className="text-xl font-bold">{ctx.schoolName}</h1>
      <p className="text-gray-600">
        {ctx.yearGroup.toUpperCase()} · {ctx.gender}
      </p>

      {!ctx.isEditable && (
        <p className="mt-2 rounded bg-amber-100 p-2 text-amber-800">
          {ctx.isExpired
            ? "This link has expired — contact the scorer for a new one."
            : "Results submitted — contact the scorer for changes."}
        </p>
      )}

      <SubmitForm
        onSaveRow={saveResult.bind(null, params.token)}
        onRemove={removeResult.bind(null, params.token)}
        onRename={renameRunnerAction.bind(null, params.token)}
        onSearchOtherSchools={searchOtherSchoolsAction.bind(null, params.token)}
        isEditable={ctx.isEditable}
        initialResults={existingResults}
        roster={roster}
      />
    </main>
  );
}
