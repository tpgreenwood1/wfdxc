import { notFound } from "next/navigation";
import { resolveToken } from "@/lib/tokens";
import { getResultsForSchoolInRace, getSchoolRoster } from "@/lib/results";
import SubmitForm from "./SubmitForm";

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
        token={params.token}
        isEditable={ctx.isEditable}
        initialResults={existingResults}
        roster={roster}
      />
    </main>
  );
}
