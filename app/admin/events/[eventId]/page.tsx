import Link from "next/link";
import { notFound } from "next/navigation";
import { getEventBoard, type BoardRace, type BoardSchool } from "@/lib/eventBoard";
import { ALL_RACES, formatEventDate, todayInLeague } from "@/lib/events";
import { raceLabel } from "@/lib/races";
import { describeIssues } from "@/lib/raceIssues";
import { chaseMessage, teacherLinkPath } from "@/lib/schools";
import StatusBadge from "@/app/components/StatusBadge";
import ConfirmSubmitButton from "@/app/components/ConfirmSubmitButton";
import CopyLinkButton from "@/app/components/CopyLinkButton";
import ShareLinkButton from "@/app/components/ShareLinkButton";
import { setStatusAction } from "@/app/admin/races/[raceId]/actions";
import {
  addRaceAction,
  confirmSchoolForEventAction,
  finaliseReadyRacesAction,
  setRaceStatusFromBoardAction,
  updateEventAction,
} from "./actions";

export const dynamic = "force-dynamic";

export default async function EventPage({
  params,
  searchParams,
}: {
  params: { eventId: string };
  searchParams: { view?: string };
}) {
  const board = await getEventBoard(params.eventId);
  if (!board) notFound();
  const { event, races, schools, summary } = board;
  const view = searchParams.view === "schools" ? "schools" : "races";
  const isToday = event.date === todayInLeague();

  const missingRaces = ALL_RACES.filter(
    (spec) => !races.some((r) => r.yearGroup === spec.yearGroup && r.gender === spec.gender)
  );

  const tab = (v: string) =>
    `min-h-[44px] flex-1 rounded px-3 py-2 text-center text-sm font-medium sm:flex-none ${
      view === v ? "bg-gray-800 text-white" : "bg-gray-100 text-gray-700"
    }`;

  return (
    <main className="mx-auto max-w-4xl space-y-4 p-4 sm:p-6">
      <header className="space-y-1">
        {isToday && (
          <p className="text-xs font-semibold uppercase tracking-wide text-green-700">
            Race day — today
          </p>
        )}
        <h1 className="text-2xl font-bold">{event.name}</h1>
        <p className="text-sm text-gray-600">
          {formatEventDate(event.date)}
          {event.location && ` · ${event.location}`}
        </p>
        <details className="text-sm">
          <summary className="cursor-pointer text-blue-600">Edit event details</summary>
          <form action={updateEventAction} className="mt-2 flex flex-wrap gap-2">
            <input type="hidden" name="eventId" value={event.id} />
            <input name="name" defaultValue={event.name} required className="min-h-[40px] rounded border px-2" />
            <input name="date" type="date" defaultValue={event.date} required className="min-h-[40px] rounded border px-2" />
            <input name="location" defaultValue={event.location ?? ""} placeholder="Location" className="min-h-[40px] rounded border px-2" />
            <button className="min-h-[40px] rounded bg-gray-800 px-3 text-white" type="submit">
              Save
            </button>
          </form>
        </details>
      </header>

      <section className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
        <Stat label="Races finalised" value={`${summary.finalised}/${summary.total - summary.cancelled}`} />
        <Stat label="Places to check" value={summary.openIssues} warn={summary.openIssues > 0} />
        <Stat label="Ready to finalise" value={summary.readyToFinalise} />
        <Stat label="Schools not done" value={summary.schoolsNotDone} warn={summary.schoolsNotDone > 0} />
      </section>

      {summary.readyToFinalise > 0 && (
        <form action={finaliseReadyRacesAction}>
          <input type="hidden" name="eventId" value={event.id} />
          <ConfirmSubmitButton
            confirmMessage={`Finalise ${summary.readyToFinalise} race(s) that are ready? Their results go public and count towards standings. You can still correct them afterwards.`}
            className="min-h-[44px] w-full rounded bg-green-700 px-4 font-medium text-white sm:w-auto"
          >
            Finalise {summary.readyToFinalise} ready race{summary.readyToFinalise === 1 ? "" : "s"}
          </ConfirmSubmitButton>
        </form>
      )}

      <nav className="flex gap-2">
        <Link href={`/admin/events/${event.id}`} className={tab("races")}>
          Races
        </Link>
        <Link href={`/admin/events/${event.id}?view=schools`} className={tab("schools")}>
          Schools{summary.schoolsNotDone > 0 ? ` (${summary.schoolsNotDone} to chase)` : ""}
        </Link>
      </nav>

      {view === "races" ? (
        <>
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {races.map((race) => (
              <RaceCard key={race.id} race={race} eventId={event.id} />
            ))}
          </ul>
          {missingRaces.length > 0 && (
            <form action={addRaceAction} className="flex flex-wrap items-center gap-2 text-sm">
              <input type="hidden" name="eventId" value={event.id} />
              <label htmlFor="add-race" className="text-gray-600">
                Add a race:
              </label>
              <select id="add-race" name="race" className="min-h-[40px] rounded border px-2">
                {missingRaces.map((spec) => (
                  <option key={`${spec.yearGroup}:${spec.gender}`} value={`${spec.yearGroup}:${spec.gender}`}>
                    {raceLabel(spec)}
                  </option>
                ))}
              </select>
              <button className="min-h-[40px] rounded bg-gray-100 px-3" type="submit">
                Add
              </button>
            </form>
          )}
        </>
      ) : (
        <SchoolsChaseList schools={schools} eventId={event.id} eventName={event.name} />
      )}

      <p className="text-sm text-gray-500">
        <Link className="underline" href={`/admin/events/${event.id}/links`}>
          Advanced: older per-event and per-race links
        </Link>
      </p>
    </main>
  );
}

function Stat({ label, value, warn }: { label: string; value: string | number; warn?: boolean }) {
  return (
    <div className={`rounded border p-2 ${warn ? "border-amber-300 bg-amber-50" : ""}`}>
      <div className="text-xl font-bold">{value}</div>
      <div className="text-xs text-gray-600">{label}</div>
    </div>
  );
}

function RaceCard({ race, eventId }: { race: BoardRace; eventId: string }) {
  const { stateCounts, issues, readiness } = race;
  const problems = describeIssues(issues);
  const confirmedCount = stateCounts.done + stateCounts.no_runners;
  const border =
    race.status === "cancelled"
      ? "border-dashed opacity-60"
      : race.status === "closed"
        ? "border-gray-300 bg-gray-50"
        : problems.length > 0
          ? "border-red-300"
          : readiness.ready
            ? "border-green-400"
            : "";

  return (
    <li className={`flex flex-col gap-2 rounded border p-3 ${border}`}>
      <div className="flex items-center justify-between gap-2">
        <Link href={`/admin/races/${race.id}`} className="text-lg font-semibold text-blue-700 underline">
          {race.label}
        </Link>
        <StatusBadge status={race.status} />
      </div>
      {race.status !== "cancelled" && (
        <p className="text-sm text-gray-700">
          {race.entries} runner{race.entries === 1 ? "" : "s"} · {confirmedCount} schools confirmed
          {stateCounts.entering > 0 && ` · ${stateCounts.entering} entering`}
          {stateCounts.not_started > 0 && (
            <span className="text-amber-800"> · {stateCounts.not_started} nothing yet</span>
          )}
        </p>
      )}
      {race.status !== "cancelled" && problems.length > 0 && (
        <Link href={`/admin/races/${race.id}`} className="text-sm font-medium text-red-800 underline">
          ⚠ {problems.join(", ")}
        </Link>
      )}
      <div className="mt-auto flex flex-wrap gap-2">
        <Link href={`/admin/races/${race.id}`} className="min-h-[40px] rounded bg-gray-100 px-3 py-2 text-sm">
          {race.status === "open" ? "Check results" : "View / correct"}
        </Link>
        {race.status === "open" && readiness.ready && (
          <form action={setStatusAction}>
            <input type="hidden" name="raceId" value={race.id} />
            <input type="hidden" name="status" value="closed" />
            <ConfirmSubmitButton
              confirmMessage={`Finalise ${race.label}? Results go public and count towards standings.`}
              className="min-h-[40px] rounded bg-green-700 px-3 text-sm text-white"
            >
              Finalise
            </ConfirmSubmitButton>
          </form>
        )}
        {race.status === "open" && race.entries === 0 && (
          <form action={setRaceStatusFromBoardAction}>
            <input type="hidden" name="eventId" value={eventId} />
            <input type="hidden" name="raceId" value={race.id} />
            <input type="hidden" name="status" value="cancelled" />
            <ConfirmSubmitButton
              confirmMessage={`Cancel ${race.label}? It won't show publicly or count towards standings.`}
              className="min-h-[40px] rounded px-3 text-sm text-gray-600"
            >
              Cancel race
            </ConfirmSubmitButton>
          </form>
        )}
        {race.status === "cancelled" && (
          <form action={setRaceStatusFromBoardAction}>
            <input type="hidden" name="eventId" value={eventId} />
            <input type="hidden" name="raceId" value={race.id} />
            <input type="hidden" name="status" value="open" />
            <button className="min-h-[40px] rounded bg-gray-100 px-3 text-sm" type="submit">
              Un-cancel
            </button>
          </form>
        )}
      </div>
    </li>
  );
}

const PROGRESS: Record<BoardSchool["progress"], { label: string; style: string }> = {
  done: { label: "Done", style: "bg-green-100 text-green-800" },
  entering: { label: "Entering", style: "bg-blue-100 text-blue-800" },
  not_started: { label: "Nothing yet", style: "bg-amber-100 text-amber-900" },
};

function SchoolsChaseList({
  schools,
  eventId,
  eventName,
}: {
  schools: BoardSchool[];
  eventId: string;
  eventName: string;
}) {
  const order = { not_started: 0, entering: 1, done: 2 };
  const sorted = [...schools].sort(
    (a, b) => order[a.progress] - order[b.progress] || a.name.localeCompare(b.name)
  );

  return (
    <section className="space-y-2">
      <p className="text-sm text-gray-600">
        Schools that haven't finished are listed first. <strong>Share reminder</strong> sends
        their link and code with a note of what's missing. A school is done once it has tapped
        "We're done" or entered/confirmed every open race.
      </p>
      <ul className="divide-y rounded border">
        {sorted.map((school) => (
          <li key={school.id} className="space-y-2 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="flex-1 font-medium">{school.name}</span>
              <span className={`rounded px-2 py-0.5 text-xs ${PROGRESS[school.progress].style}`}>
                {PROGRESS[school.progress].label}
              </span>
            </div>
            <p className="text-sm text-gray-600">
              Entered runners in {school.racesEntered} race{school.racesEntered === 1 ? "" : "s"}
              {school.outstanding.length > 0 && (
                <>
                  {" "}· Nothing yet for:{" "}
                  <span className="text-gray-800">
                    {school.outstanding.map((o) => o.label).join(", ")}
                  </span>
                </>
              )}
              {school.notMarkedDone.length > 0 && (
                <>
                  {" "}· Not marked done:{" "}
                  <span className="text-gray-800">
                    {school.notMarkedDone.map((o) => o.label).join(", ")}
                  </span>
                </>
              )}
            </p>
            {school.progress !== "done" && (
              <div className="flex flex-wrap items-center gap-2">
                <ShareLinkButton
                  path={teacherLinkPath(school)}
                  title={`${school.name} results`}
                  message={chaseMessage(
                    school,
                    eventName,
                    school.outstanding.map((o) => o.label),
                    school.notMarkedDone.map((o) => o.label)
                  )}
                  label="Share reminder"
                />
                <CopyLinkButton path={teacherLinkPath(school)} label="Copy link" />
                <span className="font-mono text-sm" title="Access code">
                  {school.accessCode}
                </span>
                <form action={confirmSchoolForEventAction}>
                  <input type="hidden" name="eventId" value={eventId} />
                  <input type="hidden" name="schoolId" value={school.id} />
                  <ConfirmSubmitButton
                    confirmMessage={`Mark ${school.name} as done for this event? Races they've entered become "done" and races with nothing become "no runners".`}
                    className="min-h-[40px] rounded bg-gray-100 px-3 text-sm"
                  >
                    Mark done for them
                  </ConfirmSubmitButton>
                </form>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
