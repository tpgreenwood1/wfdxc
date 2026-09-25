import Link from "next/link";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { events, races } from "@/db/schema";
import { loadSchoolForPage } from "@/lib/schoolAccess";
import { formatEventDate, pickCurrentEvent, todayInLeague } from "@/lib/events";
import { YEAR_GROUP_ORDER, raceLabel, sortRaces } from "@/lib/races";
import { getEntryCountsForSchool } from "@/lib/results";
import { getConfirmedStatesForEvent, type ConfirmedState } from "@/lib/raceSchoolStatus";
import ConfirmSubmitButton from "@/app/components/ConfirmSubmitButton";
import CodeGate from "./CodeGate";
import { confirmEventDoneAction } from "./actions";

export const dynamic = "force-dynamic";

type Race = typeof races.$inferSelect;

export default async function SchoolRacesPage({
  params,
  searchParams,
}: {
  params: { slug: string };
  searchParams: { event?: string };
}) {
  const { school, hasAccess } = await loadSchoolForPage(params.slug);
  if (!hasAccess) return <CodeGate slug={school.slug} />;

  const db = getDb();
  const allEvents = await db.select().from(events);
  const today = todayInLeague();
  const event =
    allEvents.find((e) => e.id === searchParams.event) ??
    pickCurrentEvent(allEvents, today);

  if (!event) {
    return (
      <p className="rounded-lg bg-gray-50 p-4 text-gray-600">
        No races have been set up yet. Meanwhile you can add your runners on the{" "}
        <Link className="text-blue-600 underline" href={`/school/${school.slug}/runners`}>
          Runners
        </Link>{" "}
        tab.
      </p>
    );
  }

  const [eventRaces, entryCounts, confirmedAll] = await Promise.all([
    db.select().from(races).where(eq(races.eventId, event.id)),
    getEntryCountsForSchool(event.id, school.id),
    getConfirmedStatesForEvent(event.id),
  ]);
  const confirmedFor = (raceId: string) => confirmedAll.get(`${raceId}:${school.id}`);
  const openRaces = eventRaces.filter((r) => r.status === "open");
  const allConfirmed = openRaces.length > 0 && openRaces.every((r) => confirmedFor(r.id));
  // Open races this school has neither entered nor confirmed — "We're done" marks these
  // as "no runners", so the teacher is asked to check the list first.
  const willMarkNoRunners = sortRaces(
    openRaces.filter((r) => !entryCounts.get(r.id) && !confirmedFor(r.id))
  ).map(raceLabel);
  const doneConfirmMessage =
    willMarkNoRunners.length === 0
      ? "Tell the scorer you've entered all your runners for this event?"
      : `These races have nothing entered and will be marked "no runners":\n\n• ${willMarkNoRunners.join(
          "\n• "
        )}\n\nIf any of your runners ran in these, tap Cancel and enter them first.`;

  const otherEvents = allEvents
    .filter((e) => e.seasonId === event.seasonId && e.id !== event.id)
    .sort((a, b) => b.date.localeCompare(a.date));

  const isToday = event.date === today;

  return (
    <div className="space-y-6">
      <section className="rounded-lg border bg-gray-50 p-3">
        {isToday && (
          <p className="text-xs font-semibold uppercase tracking-wide text-green-700">
            Race day — today
          </p>
        )}
        <h2 className="text-lg font-semibold">{event.name}</h2>
        <p className="text-sm text-gray-600">
          {formatEventDate(event.date)}
          {event.location && ` · ${event.location}`}
        </p>
      </section>

      {eventRaces.length === 0 ? (
        <p className="text-gray-600">No races in this event yet.</p>
      ) : (
        <section className="space-y-2" aria-label="Races">
          <p className="text-sm text-gray-600">Tap a race to enter or check your runners.</p>
          {YEAR_GROUP_ORDER.map((yearGroup) => {
            const boys = eventRaces.find((r) => r.yearGroup === yearGroup && r.gender === "boys");
            const girls = eventRaces.find((r) => r.yearGroup === yearGroup && r.gender === "girls");
            if (!boys && !girls) return null;
            return (
              <div key={yearGroup} className="grid grid-cols-2 gap-2">
                {[boys, girls].map((race, i) =>
                  race ? (
                    <RaceButton
                      key={race.id}
                      race={race}
                      slug={school.slug}
                      entered={entryCounts.get(race.id) ?? 0}
                      confirmed={confirmedFor(race.id)}
                    />
                  ) : (
                    <div key={i} />
                  )
                )}
              </div>
            );
          })}
        </section>
      )}

      {openRaces.length > 0 && (
        <section className="rounded-lg border p-3">
          {allConfirmed ? (
            <p className="text-sm text-green-800">
              ✓ You&apos;ve told the scorer you&apos;re done for this event. You can still make
              changes until the results are finalised.
            </p>
          ) : (
            <form
              action={confirmEventDoneAction.bind(null, school.slug, event.id)}
              className="space-y-2"
            >
              <p className="text-sm text-gray-700">
                Entered all your runners? Let the scorer know — any race you haven&apos;t entered
                will be marked as &ldquo;no runners&rdquo;.
              </p>
              <ConfirmSubmitButton
                confirmMessage={doneConfirmMessage}
                className="min-h-[48px] w-full rounded-lg bg-green-700 px-4 font-semibold text-white"
                pendingLabel="Saving…"
              >
                We&apos;re done for {isToday ? "today" : "this event"}
              </ConfirmSubmitButton>
            </form>
          )}
        </section>
      )}

      {otherEvents.length > 0 && (
        <section>
          <h2 className="font-semibold text-gray-700">Other events this season</h2>
          <ul className="mt-1 divide-y rounded-lg border">
            {otherEvents.map((e) => (
              <li key={e.id}>
                <Link
                  href={`/school/${school.slug}?event=${e.id}`}
                  className="flex min-h-[48px] items-center justify-between px-3"
                >
                  <span>{e.name}</span>
                  <span className="text-sm text-gray-500">{formatEventDate(e.date)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function RaceButton({
  race,
  slug,
  entered,
  confirmed,
}: {
  race: Race;
  slug: string;
  entered: number;
  confirmed: ConfirmedState | undefined;
}) {
  const label = raceLabel(race);
  const base = "flex min-h-[64px] flex-col justify-center rounded-lg border px-3 py-2";

  if (race.status === "cancelled") {
    return (
      <div className={`${base} border-dashed bg-gray-50 text-gray-400`}>
        <span className="font-semibold line-through">{label}</span>
        <span className="text-sm">Cancelled</span>
      </div>
    );
  }

  if (race.status === "closed") {
    return (
      <Link href={`/results/${race.id}`} className={`${base} bg-gray-100 text-gray-700`}>
        <span className="font-semibold">{label}</span>
        <span className="text-sm">
          {entered > 0 ? `${entered} ran · ` : ""}Results →
        </span>
      </Link>
    );
  }

  return (
    <Link
      href={`/school/${slug}/race/${race.id}`}
      className={`${base} ${
        entered > 0
          ? confirmed === "done"
            ? "border-green-600 bg-green-50 text-green-900"
            : "border-green-600 bg-white text-green-900"
          : confirmed
            ? "border-gray-300 bg-gray-50 text-gray-600"
            : "border-blue-600 bg-white text-blue-700"
      }`}
    >
      <span className="font-semibold">{label}</span>
      <span className="text-sm">
        {entered > 0
          ? confirmed === "done"
            ? `✓ ${entered} entered · done`
            : `${entered} entered · not marked done`
          : confirmed
            ? "No runners"
            : "Enter results"}
      </span>
    </Link>
  );
}
