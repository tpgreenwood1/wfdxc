import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { races } from "@/db/schema";
import { resolveHubToken } from "@/lib/hubTokens";
import { getOrCreateSubmissionToken } from "@/lib/tokens";
import { getSchoolRoster, getSubmittedRaceIdsForSchool } from "@/lib/results";
import StatusBadge from "@/app/components/StatusBadge";
import RosterManager from "./RosterManager";

export const dynamic = "force-dynamic";

const YEAR_GROUP_ORDER = ["reception", "y1", "y2", "y3", "y4", "y5", "y6"];

export default async function HubPage({
  params,
}: {
  params: { token: string };
}) {
  const ctx = await resolveHubToken(params.token);
  if (!ctx) notFound();

  const db = getDb();
  const eventRaces = await db
    .select()
    .from(races)
    .where(eq(races.eventId, ctx.eventId));

  eventRaces.sort((a, b) => {
    const yearDiff =
      YEAR_GROUP_ORDER.indexOf(a.yearGroup) - YEAR_GROUP_ORDER.indexOf(b.yearGroup);
    if (yearDiff !== 0) return yearDiff;
    return a.gender.localeCompare(b.gender);
  });

  const [submittedRaceIds, roster] = await Promise.all([
    getSubmittedRaceIdsForSchool(ctx.eventId, ctx.schoolId),
    getSchoolRoster(ctx.schoolId, { includeRetired: true }),
  ]);

  const eventDate = new Date(ctx.eventDate);
  const openRaceTokens = new Map(
    await Promise.all(
      eventRaces
        .filter((r) => r.status === "open")
        .map(
          async (r) =>
            [r.id, await getOrCreateSubmissionToken(r.id, ctx.schoolId, eventDate)] as const
        )
    )
  );

  return (
    <main className="mx-auto max-w-2xl space-y-4 p-6">
      <div>
        <h1 className="text-2xl font-bold">{ctx.schoolName}</h1>
        <p className="text-gray-600">
          {ctx.eventName} — {ctx.eventDate}
        </p>
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="text-left">
            <th className="py-1">Race</th>
            <th className="py-1">Status</th>
            <th className="py-1">Submission</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {eventRaces.map((race) => {
            const submitted = submittedRaceIds.has(race.id);
            return (
              <tr key={race.id} className="border-t">
                <td className="py-1">
                  {race.yearGroup.toUpperCase()} · {race.gender}
                </td>
                <td className="py-1">
                  <StatusBadge status={race.status} />
                </td>
                <td className="py-1">
                  {race.status === "cancelled" ? "—" : submitted ? "Submitted" : "Not started"}
                </td>
                <td className="py-1">
                  {race.status === "open" && (
                    <Link
                      className="text-blue-600 underline"
                      href={`/submit/${openRaceTokens.get(race.id)}`}
                    >
                      {submitted ? "Edit entry" : "Enter results"}
                    </Link>
                  )}
                  {race.status === "closed" && (
                    <Link
                      className="text-blue-600 underline"
                      href={`/results/${race.id}`}
                    >
                      View results
                    </Link>
                  )}
                  {race.status === "cancelled" && (
                    <span className="text-gray-500">Race cancelled</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <section>
        <h2 className="text-lg font-semibold">Your runners</h2>
        <RosterManager token={params.token} initialRoster={roster} />
      </section>
    </main>
  );
}
