import Link from "next/link";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { events, races, schools } from "@/db/schema";
import { isDiverged } from "@/lib/publish";
import { getSubmissionStatusMatrix } from "@/lib/results";
import StatusBadge from "@/app/components/StatusBadge";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function EventPage({
  params,
}: {
  params: { eventId: string };
}) {
  const db = getDb();
  const [event] = await db.select().from(events).where(eq(events.id, params.eventId));
  if (!event) notFound();

  const [eventRaces, allSchools, submitted] = await Promise.all([
    db.select().from(races).where(eq(races.eventId, params.eventId)),
    db.select().from(schools),
    getSubmissionStatusMatrix(params.eventId),
  ]);

  const divergence = await Promise.all(
    eventRaces.map((r) => (r.status === "closed" ? isDiverged(r.id) : Promise.resolve(false)))
  );

  return (
    <main className="mx-auto max-w-2xl space-y-4 p-6">
      <h1 className="text-2xl font-bold">
        {event.name} — {event.date}
      </h1>

      <Link className="text-blue-600 underline" href={`/admin/events/${event.id}/links`}>
        Manage entry links
      </Link>

      <table className="w-full text-sm">
        <thead>
          <tr className="text-left">
            <th className="py-1">Race</th>
            <th className="py-1">Status</th>
            <th className="py-1">Submissions</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {eventRaces.map((race, i) => {
            const submittedCount = allSchools.filter((s) =>
              submitted.has(`${race.id}:${s.id}`)
            ).length;
            return (
              <tr key={race.id} className="border-t">
                <td className="py-1">
                  {race.yearGroup.toUpperCase()} · {race.gender}
                </td>
                <td className="py-1">
                  <StatusBadge status={race.status} />
                  {divergence[i] && (
                    <span className="ml-2 rounded bg-amber-200 px-1 text-amber-900">
                      diverged from published
                    </span>
                  )}
                </td>
                <td className="py-1">
                  {submittedCount}/{allSchools.length} schools
                </td>
                <td className="py-1">
                  <Link className="text-blue-600 underline" href={`/admin/races/${race.id}`}>
                    Open
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </main>
  );
}
