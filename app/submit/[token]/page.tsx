import Link from "next/link";
import { notFound } from "next/navigation";
import { resolveToken } from "@/lib/tokens";
import { getResultsForSchoolInRace, getSchoolRoster } from "@/lib/results";
import SubmitForm from "@/app/components/SubmitForm";
import HelpButton from "@/app/components/HelpButton";
import {
  claimRunnerAction,
  removeResult,
  renameRunnerAction,
  saveResult,
  searchOtherSchoolsAction,
} from "./actions";

export const dynamic = "force-dynamic";

export default async function SubmitPage({
  params,
}: {
  params: { token: string };
}) {
  const ctx = await resolveToken(params.token);
  if (!ctx) notFound();

  const [existingResults, roster] = await Promise.all([
    getResultsForSchoolInRace(ctx.raceId, ctx.schoolId),
    getSchoolRoster(ctx.schoolId),
  ]);

  return (
    <main className="mx-auto max-w-md p-4">
      {/* Straight to the school page, which asks for the code if this device isn't
          unlocked — a per-race link only grants this one race. */}
      <Link
        className="text-sm text-blue-600 underline"
        href={`/school/${ctx.schoolSlug}?event=${ctx.eventId}`}
      >
        &larr; Back to all races
      </Link>
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-bold">{ctx.schoolName}</h1>
        <HelpButton topics={["entry"]} />
      </div>
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
        storageKey={`xc-entry:${ctx.raceId}:${ctx.schoolId}`}
        onClaimRunner={claimRunnerAction.bind(null, params.token)}
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
