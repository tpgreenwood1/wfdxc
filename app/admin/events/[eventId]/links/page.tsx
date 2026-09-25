import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { events, races, schools, submissionTokens } from "@/db/schema";
import { getOrCreateHubTokensForEvent } from "@/lib/hubTokens";
import { getSubmissionStatusMatrix } from "@/lib/results";
import CopyLinkButton from "@/app/components/CopyLinkButton";
import { sortRaces } from "@/lib/races";
import { isUuid } from "@/lib/ids";
import { regenerateHubTokenAction, regenerateSubmissionTokenAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function EventLinksPage({
  params,
}: {
  params: { eventId: string };
}) {
  if (!isUuid(params.eventId)) notFound();
  const db = getDb();
  const [event] = await db.select().from(events).where(eq(events.id, params.eventId));
  if (!event) notFound();

  const [eventRaces, allSchools, hubTokens, submissionRows, submitted] = await Promise.all([
    db.select().from(races).where(eq(races.eventId, params.eventId)),
    db.select().from(schools).orderBy(schools.name),
    getOrCreateHubTokensForEvent(params.eventId),
    db
      .select({
        id: submissionTokens.id,
        raceId: submissionTokens.raceId,
        schoolId: submissionTokens.schoolId,
        token: submissionTokens.token,
      })
      .from(submissionTokens)
      .innerJoin(races, eq(submissionTokens.raceId, races.id))
      .where(eq(races.eventId, params.eventId)),
    getSubmissionStatusMatrix(params.eventId),
  ]);

  sortRaces(eventRaces);

  const submissionTokenByCell = new Map(
    submissionRows.map((r) => [`${r.raceId}:${r.schoolId}`, r])
  );

  return (
    <main className="mx-auto max-w-5xl space-y-4 p-6">
      <h1 className="text-2xl font-bold">
        {event.name} — {event.date}
      </h1>
      <p className="text-gray-600">Entry links by school</p>
      <p className="rounded bg-blue-50 p-2 text-sm text-blue-900">
        Schools should use their <strong>teacher link</strong> (from the{" "}
        <a className="underline" href="/admin/schools">Schools</a> page) — one
        link for the whole season. The per-event hub links below still work and open
        the same school home page; the per-race links are only for chasing one school
        on one race.
      </p>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left">
              <th className="py-1 pr-2">School</th>
              <th className="py-1 pr-2">Hub link</th>
              {eventRaces.map((race) => (
                <th key={race.id} className="py-1 pr-2 whitespace-nowrap">
                  {race.yearGroup.toUpperCase()} · {race.gender}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {allSchools.map((school) => {
              const hubToken = hubTokens.get(school.id);
              return (
                <tr key={school.id} className="border-t align-top">
                  <td className="py-1 pr-2 font-medium whitespace-nowrap">{school.name}</td>
                  <td className="py-1 pr-2">
                    {hubToken && (
                      <div className="flex items-center gap-1">
                        <CopyLinkButton path={`/hub/${hubToken.token}`} label="Copy hub link" />
                        <form action={regenerateHubTokenAction}>
                          <input type="hidden" name="eventId" value={params.eventId} />
                          <input type="hidden" name="tokenId" value={hubToken.id} />
                          <button className="rounded bg-gray-100 px-2 py-0.5 text-xs" type="submit">
                            Regenerate
                          </button>
                        </form>
                      </div>
                    )}
                  </td>
                  {eventRaces.map((race) => {
                    const cellKey = `${race.id}:${school.id}`;
                    const isSubmitted = submitted.has(cellKey);
                    const token = submissionTokenByCell.get(cellKey);
                    return (
                      <td key={race.id} className="py-1 pr-2">
                        <div className="flex items-center gap-1 whitespace-nowrap">
                          <span
                            className={
                              isSubmitted ? "text-green-700" : "text-gray-500"
                            }
                          >
                            {isSubmitted ? "Submitted" : "Not started"}
                          </span>
                          {token && (
                            <>
                              <CopyLinkButton path={`/submit/${token.token}`} label="Copy" />
                              <form action={regenerateSubmissionTokenAction}>
                                <input type="hidden" name="eventId" value={params.eventId} />
                                <input type="hidden" name="tokenId" value={token.id} />
                                <button
                                  className="rounded bg-gray-100 px-2 py-0.5 text-xs"
                                  type="submit"
                                >
                                  Regen
                                </button>
                              </form>
                            </>
                          )}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </main>
  );
}
