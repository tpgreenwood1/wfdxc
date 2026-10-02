import Link from "next/link";
import { notFound } from "next/navigation";
import { count, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { events, races, results, schools } from "@/db/schema";
import { isUuid } from "@/lib/ids";
import { raceLabel, sortRaces } from "@/lib/raceLabels";
import { getResultsForSchoolInRace, getSchoolRoster } from "@/lib/results";
import { getConfirmedStatesForRace, schoolRaceState } from "@/lib/raceSchoolStatus";
import { getSchoolById } from "@/lib/schools";
import SubmitForm from "@/app/components/SubmitForm";
import SubmitButton from "@/app/components/SubmitButton";
import StatusBadge from "@/app/components/StatusBadge";
import { STATE_LABEL, STATE_STYLE } from "../../schoolStates";
import {
  adminClaimRunnerAction,
  adminRemoveResultAction,
  adminRenameRunnerAction,
  adminSaveResultAction,
  adminSearchOtherSchoolsAction,
  adminSetSchoolStateAction,
} from "./actions";

export const dynamic = "force-dynamic";

/** The teacher entry form, for the scorer to type in a school's paper sheet. Navigation
 * runs on two axes: other schools in this race (the switcher) and other races for this
 * school (prev/next) — sheets come either way on race day. */
export default async function AdminEnterForSchoolPage({
  params,
}: {
  params: { raceId: string; schoolId: string };
}) {
  if (!isUuid(params.raceId) || !isUuid(params.schoolId)) notFound();
  const db = getDb();
  const [[row], school] = await Promise.all([
    db
      .select({ race: races, event: events })
      .from(races)
      .innerJoin(events, eq(races.eventId, events.id))
      .where(eq(races.id, params.raceId)),
    getSchoolById(params.schoolId),
  ]);
  if (!row || !school) notFound();
  const { race, event } = row;

  const [existingResults, roster, eventRaces, confirmed, allSchools, counts] = await Promise.all([
    getResultsForSchoolInRace(race.id, school.id),
    getSchoolRoster(school.id),
    db.select().from(races).where(eq(races.eventId, event.id)),
    getConfirmedStatesForRace(race.id),
    db.select({ id: schools.id, name: schools.name }).from(schools).orderBy(schools.name),
    db
      .select({ schoolId: results.schoolId, n: count() })
      .from(results)
      .where(eq(results.raceId, race.id))
      .groupBy(results.schoolId),
  ]);

  const entered = new Map(counts.map((c) => [c.schoolId, Number(c.n)]));
  const schoolStates = allSchools.map((s) => ({
    ...s,
    state: schoolRaceState(entered.get(s.id) ?? 0, confirmed.get(s.id)),
  }));
  const myState = confirmed.get(school.id);
  const hasEntries = existingResults.length > 0;
  const isEditable = race.status !== "cancelled";

  // Same toggle as the teacher page: "Race done" once runners are in, "No runners" before.
  const confirmTarget = hasEntries
    ? myState === "done" ? null : "done"
    : myState === "no_runners" ? null : "no_runners";
  const confirmText = hasEntries
    ? myState === "done"
      ? `✓ Marked done for ${school.name}.`
      : `Entered everyone on ${school.name}'s sheet? Mark the race done for them.`
    : myState === "no_runners"
      ? `✓ Marked as no runners for ${school.name}.`
      : `Nobody from ${school.name} in this race? Mark no runners.`;
  const confirmLabel = confirmTarget === null ? "Undo" : hasEntries ? "Race done" : "No runners";

  const steppable = sortRaces(eventRaces).filter((r) => r.status !== "cancelled");
  const index = steppable.findIndex((r) => r.id === race.id);
  const prev = index > 0 ? steppable[index - 1] : null;
  const next = index >= 0 && index < steppable.length - 1 ? steppable[index + 1] : null;
  const enterHref = (raceId: string, schoolId: string) =>
    `/admin/races/${raceId}/enter/${schoolId}`;

  // Wraps round the alphabetical list so it always finds one if any are left.
  const myIndex = schoolStates.findIndex((s) => s.id === school.id);
  const nextWaiting = [...schoolStates.slice(myIndex + 1), ...schoolStates.slice(0, myIndex)].find(
    (s) => s.state === "not_started"
  );

  return (
    <main className="mx-auto max-w-2xl space-y-3 p-4 pb-24 sm:p-6">
      <div className="sticky top-0 z-10 -mx-4 space-y-2 border-b bg-white px-4 pb-2 pt-1 sm:-mx-6 sm:px-6">
        <Link
          href={`/admin/races/${race.id}`}
          className="inline-flex min-h-[44px] items-center font-medium text-blue-600"
        >
          ← Back to {raceLabel(race)}
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-bold">
            Entering for {school.name} · {raceLabel(race)}
          </h1>
          <span className="rounded bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-900">
            Admin entry
          </span>
          {race.status !== "open" && <StatusBadge status={race.status} />}
        </div>
        <nav aria-label="Other schools" className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
          {schoolStates.map((s) => (
            <Link
              key={s.id}
              href={enterHref(race.id, s.id)}
              aria-current={s.id === school.id ? "page" : undefined}
              title={STATE_LABEL[s.state]}
              className={`flex min-h-[36px] shrink-0 items-center whitespace-nowrap rounded-full px-3 text-sm ${
                STATE_STYLE[s.state]
              } ${s.id === school.id ? "font-semibold ring-2 ring-blue-600" : ""}`}
            >
              {s.name}
            </Link>
          ))}
        </nav>
      </div>

      <p className="text-sm text-gray-600">{event.name}</p>

      {race.status === "closed" && (
        <p className="rounded-lg bg-amber-100 p-3 text-sm text-amber-900">
          This race is finalised — each change here updates the public results straight away.
        </p>
      )}
      {race.status === "cancelled" && (
        <p className="rounded-lg bg-gray-100 p-3 text-gray-700">This race was cancelled.</p>
      )}

      {isEditable && (
        <form
          action={adminSetSchoolStateAction.bind(null, race.id, school.id, confirmTarget)}
          className={`flex flex-wrap items-center gap-2 rounded-lg p-3 ${
            confirmTarget === null ? "bg-green-50" : "border border-dashed"
          }`}
        >
          <span className="flex-1 text-sm text-gray-700">{confirmText}</span>
          <SubmitButton className="min-h-[44px] rounded-lg bg-white px-4 text-sm font-medium ring-1 ring-gray-300">
            {confirmLabel}
          </SubmitButton>
        </form>
      )}

      {isEditable && (
        <SubmitForm
          // Keyed so switching school or race remounts the form with fresh state.
          key={`${race.id}:${school.id}`}
          storageKey={`xc-admin-entry:${race.id}:${school.id}`}
          isEditable
          initialResults={existingResults}
          roster={roster}
          onSaveRow={adminSaveResultAction.bind(null, race.id, school.id)}
          onRemove={adminRemoveResultAction.bind(null, race.id, school.id)}
          onRename={adminRenameRunnerAction.bind(null, race.id)}
          onSearchOtherSchools={adminSearchOtherSchoolsAction.bind(null, school.id)}
          onClaimRunner={adminClaimRunnerAction.bind(null, race.id, school.id)}
        />
      )}

      <nav className="mt-6 space-y-2" aria-label="Keep entering">
        <div className="grid grid-cols-2 gap-2">
          {prev ? (
            <Link
              href={enterHref(prev.id, school.id)}
              className="flex min-h-[48px] items-center rounded-lg border px-3 text-blue-700"
            >
              ← {raceLabel(prev)}
            </Link>
          ) : (
            <span />
          )}
          {next ? (
            <Link
              href={enterHref(next.id, school.id)}
              className="flex min-h-[48px] items-center justify-end rounded-lg bg-blue-600 px-3 font-semibold text-white"
            >
              Next race: {raceLabel(next)} →
            </Link>
          ) : (
            <span />
          )}
        </div>
        {nextWaiting && (
          <Link
            href={enterHref(race.id, nextWaiting.id)}
            className="flex min-h-[48px] items-center justify-center rounded-lg border border-amber-300 bg-amber-50 px-3 text-center text-amber-900"
          >
            Next school with nothing yet: {nextWaiting.name} →
          </Link>
        )}
        <Link
          href={`/admin/races/${race.id}`}
          className="flex min-h-[48px] items-center justify-center rounded-lg bg-gray-100 px-3"
        >
          Done — back to {raceLabel(race)}
        </Link>
      </nav>
    </main>
  );
}
