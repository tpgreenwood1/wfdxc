import Link from "next/link";
import { notFound } from "next/navigation";
import { getEventExport, sharedLabel } from "@/lib/eventExport";
import { formatEventDate } from "@/lib/events";
import PrintButton from "./PrintButton";

export const dynamic = "force-dynamic";

/**
 * Printable results for an event (or one race with ?race=), one race per page. Built
 * from live results, so it doubles as the paper fallback before races are finalised —
 * those are marked PROVISIONAL.
 */
export default async function PrintEventPage({
  params,
  searchParams,
}: {
  params: { eventId: string };
  searchParams: { race?: string };
}) {
  const data = await getEventExport(params.eventId, searchParams.race);
  if (!data) notFound();
  const { event } = data;

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-4 sm:p-6 print:max-w-none print:p-0">
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <Link href={`/admin/events/${event.id}`} className="text-sm text-blue-600 underline">
          ← {event.name}
        </Link>
        <span className="flex-1" />
        {searchParams.race && (
          <Link href={`/admin/events/${event.id}/print`} className="text-sm text-blue-600 underline">
            Whole event
          </Link>
        )}
        <PrintButton />
      </div>

      {data.races.length === 0 && <p className="text-gray-600">No races to print.</p>}

      {data.races.map((race, i) => {
        const pos = sharedLabel(race.individual.map((r) => r.position));
        const rank = sharedLabel(race.teams.map((t) => t.rank));
        return (
          <section key={race.id} className={i > 0 ? "break-before-page pt-4" : ""}>
            <p className="text-sm text-gray-600">
              {event.name} · {formatEventDate(event.date)}
              {event.location && ` · ${event.location}`}
            </p>
            <h1 className="text-2xl font-bold">
              {race.label}
              {race.status !== "closed" && (
                <span className="ml-2 align-middle text-sm font-semibold text-amber-700">
                  PROVISIONAL
                </span>
              )}
            </h1>

            {race.individual.length === 0 ? (
              <p className="mt-2 text-gray-600">No results entered.</p>
            ) : (
              <div className="mt-3 grid gap-6 sm:grid-cols-[1fr_auto] print:grid-cols-[1fr_auto]">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="py-1 pr-2">Pos</th>
                      <th className="py-1 pr-2">Runner</th>
                      <th className="py-1">School</th>
                    </tr>
                  </thead>
                  <tbody>
                    {race.individual.map((r) => (
                      <tr key={r.runnerId} className="border-b border-gray-100 break-inside-avoid">
                        <td className="py-0.5 pr-2">{pos(r.position)}</td>
                        <td className="py-0.5 pr-2">{r.runnerName}</td>
                        <td className="py-0.5">{r.schoolName}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <table className="text-sm">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="py-1 pr-2">Team</th>
                      <th className="py-1 pr-2">School</th>
                      <th className="py-1 pr-2" title="Runners counted">Ran</th>
                      <th className="py-1">Pts</th>
                    </tr>
                  </thead>
                  <tbody>
                    {race.teams.map((t) => (
                      <tr key={t.schoolId} className="border-b border-gray-100">
                        <td className="py-0.5 pr-2">{rank(t.rank)}</td>
                        <td className="py-0.5 pr-2">{t.schoolName}</td>
                        <td className="py-0.5 pr-2">{t.scoringCount}</td>
                        <td className="py-0.5">{t.scoreSum}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        );
      })}
    </main>
  );
}
