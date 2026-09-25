import Link from "next/link";
import { getDb } from "@/db/client";
import { events } from "@/db/schema";
import { getEventBoard } from "@/lib/eventBoard";
import { formatEventDate, pickCurrentEvent, todayInLeague } from "@/lib/events";
import { describeIssues } from "@/lib/raceIssues";
import { chaseMessage, teacherLinkPath } from "@/lib/schools";
import ShareLinkButton from "@/app/components/ShareLinkButton";
import ConfirmSubmitButton from "@/app/components/ConfirmSubmitButton";
import { finaliseReadyRacesAction } from "./events/[eventId]/actions";

export const dynamic = "force-dynamic";

/** Race-day home: the current event's progress and whatever needs doing next. */
export default async function AdminTodayPage() {
  const db = getDb();
  const allEvents = await db.select().from(events);
  const today = todayInLeague();
  const current = pickCurrentEvent(allEvents, today);

  if (!current) {
    return (
      <main className="mx-auto max-w-3xl space-y-4 p-4 sm:p-6">
        <h1 className="text-2xl font-bold">Today</h1>
        <p className="rounded bg-gray-50 p-4 text-gray-700">
          No events yet. Add schools and create the first event on the{" "}
          <Link className="text-blue-600 underline" href="/admin/setup">
            Setup
          </Link>{" "}
          page.
        </p>
      </main>
    );
  }

  const board = await getEventBoard(current.id);
  if (!board) return null;
  const { event, races, schools, summary } = board;
  const isToday = event.date === today;
  const problemRaces = races.filter((r) => r.status !== "cancelled" && r.issues.openCount > 0);
  const schoolsToChase = schools
    .filter((s) => s.progress !== "done")
    // Schools with nothing at all first — they're the ones most likely to have forgotten.
    .sort((a, b) => Number(b.progress === "not_started") - Number(a.progress === "not_started"));
  const allDone = summary.finalised + summary.cancelled === summary.total;

  return (
    <main className="mx-auto max-w-3xl space-y-5 p-4 sm:p-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          {isToday ? "Race day — today" : event.date > today ? "Next event" : "Most recent event"}
        </p>
        <h1 className="text-2xl font-bold">
          <Link href={`/admin/events/${event.id}`} className="underline decoration-dotted">
            {event.name}
          </Link>
        </h1>
        <p className="text-sm text-gray-600">
          {formatEventDate(event.date)}
          {event.location && ` · ${event.location}`}
        </p>
      </header>

      <section className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
        <Stat href={`/admin/events/${event.id}`} label="Races finalised" value={`${summary.finalised}/${summary.total - summary.cancelled}`} />
        <Stat href={`/admin/events/${event.id}`} label="Places to check" value={summary.openIssues} warn={summary.openIssues > 0} />
        <Stat href={`/admin/events/${event.id}`} label="Ready to finalise" value={summary.readyToFinalise} />
        <Stat href={`/admin/events/${event.id}?view=schools`} label="Schools not done" value={summary.schoolsNotDone} warn={summary.schoolsNotDone > 0} />
      </section>

      {allDone && (
        <p className="rounded bg-green-50 p-3 text-green-900">
          ✓ Every race in this event is finalised or cancelled.{" "}
          <Link className="underline" href="/standings">
            See standings
          </Link>
        </p>
      )}

      {summary.readyToFinalise > 0 && (
        <form action={finaliseReadyRacesAction}>
          <input type="hidden" name="eventId" value={event.id} />
          <ConfirmSubmitButton
            confirmMessage={`Finalise ${summary.readyToFinalise} race(s) that are ready? Their results go public and count towards standings. You can still correct them afterwards.`}
            className="min-h-[48px] w-full rounded bg-green-700 px-4 font-medium text-white"
          >
            Finalise {summary.readyToFinalise} ready race{summary.readyToFinalise === 1 ? "" : "s"}
          </ConfirmSubmitButton>
        </form>
      )}

      {problemRaces.length > 0 && (
        <section>
          <h2 className="font-semibold">Places to check</h2>
          <ul className="mt-1 divide-y rounded border">
            {problemRaces.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/admin/races/${r.id}`}
                  className="flex min-h-[48px] items-center justify-between gap-2 px-3"
                >
                  <span className="font-medium">{r.label}</span>
                  <span className="text-sm text-red-800">{describeIssues(r.issues).join(", ")} →</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {schoolsToChase.length > 0 && (
        <section>
          <div className="flex items-baseline justify-between">
            <h2 className="font-semibold">Schools to chase</h2>
            <Link className="text-sm text-blue-600 underline" href={`/admin/events/${event.id}?view=schools`}>
              All schools
            </Link>
          </div>
          <ul className="mt-1 divide-y rounded border">
            {schoolsToChase.slice(0, 8).map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-2 p-3">
                <span className="flex-1">
                  <span className="font-medium">{s.name}</span>
                  <span className="block text-xs text-gray-600">
                    {s.progress === "not_started"
                      ? "Nothing entered yet"
                      : `${s.outstanding.length} race(s) with nothing yet`}
                  </span>
                </span>
                <ShareLinkButton
                  path={teacherLinkPath(s)}
                  title={`${s.name} results`}
                  message={chaseMessage(s, event.name, s.outstanding.map((o) => o.label))}
                  label="Share reminder"
                />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <form action="/admin/runners" className="flex gap-2">
          <input
            name="q"
            type="search"
            placeholder="Find a runner…"
            className="min-h-[44px] flex-1 rounded border px-2"
          />
          <button className="min-h-[44px] rounded bg-gray-800 px-3 text-white" type="submit">
            Find
          </button>
        </form>
        <Link
          href="/admin/schools"
          className="flex min-h-[44px] items-center justify-center rounded bg-gray-100 px-3 text-center"
        >
          Teacher lost their link or code? →
        </Link>
      </section>
    </main>
  );
}

function Stat({
  href,
  label,
  value,
  warn,
}: {
  href: string;
  label: string;
  value: string | number;
  warn?: boolean;
}) {
  return (
    <Link href={href} className={`rounded border p-2 ${warn ? "border-amber-300 bg-amber-50" : ""}`}>
      <div className="text-xl font-bold">{value}</div>
      <div className="text-xs text-gray-600">{label}</div>
    </Link>
  );
}
