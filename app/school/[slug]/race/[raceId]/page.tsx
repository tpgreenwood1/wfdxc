import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { events, races } from "@/db/schema";
import { loadSchoolForPage } from "@/lib/schoolAccess";
import { isUuid } from "@/lib/ids";
import { raceLabel, sortRaces } from "@/lib/races";
import { getResultsForSchoolInRace, getSchoolRoster } from "@/lib/results";
import SubmitForm from "@/app/components/SubmitForm";
import SubmitButton from "@/app/components/SubmitButton";
import CodeGate from "../../CodeGate";
import { getConfirmedStatesForRace } from "@/lib/raceSchoolStatus";
import {
  claimRunnerAction,
  removeRaceResultAction,
  renameRunnerAction,
  saveRaceResultAction,
  searchOtherSchoolsAction,
  setNoRunnersAction,
  setRaceDoneAction,
} from "../../actions";

export const dynamic = "force-dynamic";

export default async function SchoolRaceEntryPage({
  params,
}: {
  params: { slug: string; raceId: string };
}) {
  const { school, hasAccess } = await loadSchoolForPage(params.slug);
  if (!hasAccess) return <CodeGate slug={school.slug} />;
  if (!isUuid(params.raceId)) notFound();

  const db = getDb();
  const [row] = await db
    .select({ race: races, event: events })
    .from(races)
    .innerJoin(events, eq(races.eventId, events.id))
    .where(eq(races.id, params.raceId));
  if (!row) notFound();
  const { race, event } = row;

  const [existingResults, roster, eventRaces, confirmed] = await Promise.all([
    getResultsForSchoolInRace(race.id, school.id),
    getSchoolRoster(school.id),
    db.select().from(races).where(eq(races.eventId, event.id)),
    getConfirmedStatesForRace(race.id),
  ]);
  const markedNoRunners = confirmed.get(school.id) === "no_runners";
  const markedDone = confirmed.get(school.id) === "done";

  // Prev/next skip cancelled races so a teacher can step through every race that
  // needs entering without going back to the list.
  const steppable = sortRaces(eventRaces).filter((r) => r.status !== "cancelled");
  const index = steppable.findIndex((r) => r.id === race.id);
  const prev = index > 0 ? steppable[index - 1] : null;
  const next = index >= 0 && index < steppable.length - 1 ? steppable[index + 1] : null;
  const hrefFor = (r: { id: string }) => `/school/${school.slug}/race/${r.id}`;
  const isEditable = race.status === "open";

  return (
    <div>
      <Link
        href={`/school/${school.slug}?event=${event.id}`}
        className="inline-flex min-h-[44px] items-center text-blue-600"
      >
        ← All races
      </Link>
      <h2 className="text-xl font-bold">{raceLabel(race)}</h2>
      <p className="text-sm text-gray-600">{event.name}</p>

      {race.status === "closed" && (
        <p className="mt-3 rounded-lg bg-amber-100 p-3 text-amber-900">
          This race is closed — contact the scorer for changes.{" "}
          <Link className="font-medium underline" href={`/results/${race.id}`}>
            See full results
          </Link>
        </p>
      )}
      {race.status === "cancelled" && (
        <p className="mt-3 rounded-lg bg-gray-100 p-3 text-gray-700">This race was cancelled.</p>
      )}

      {/* Results are announced race by race, so the scorer needs to know each race is
          complete rather than waiting for "We're done" at the end of the event. Sits
          above the runner list so it isn't lost below a long race. */}
      {isEditable && existingResults.length > 0 && (
        <form
          action={setRaceDoneAction.bind(null, school.slug, race.id, !markedDone)}
          className={`mt-3 flex flex-wrap items-center gap-2 rounded-lg p-3 ${
            markedDone ? "bg-green-50" : "border border-dashed"
          }`}
        >
          <span className={`flex-1 text-sm ${markedDone ? "text-green-800" : "text-gray-700"}`}>
            {markedDone
              ? "✓ You've told the scorer this race is complete. You can still make changes until it's finalised."
              : "Entered all your runners for this race? Let the scorer know so they can announce it."}
          </span>
          <SubmitButton
            className={
              markedDone
                ? "min-h-[44px] rounded-lg bg-white px-4 text-sm font-medium ring-1 ring-gray-300"
                : "min-h-[44px] rounded-lg bg-green-700 px-4 text-sm font-semibold text-white"
            }
          >
            {markedDone ? "Undo" : "Race done"}
          </SubmitButton>
        </form>
      )}

      {race.status !== "cancelled" && (
        <SubmitForm
          storageKey={`xc-entry:${race.id}:${school.id}`}
          isEditable={isEditable}
          initialResults={existingResults}
          roster={roster}
          onSaveRow={saveRaceResultAction.bind(null, school.slug, race.id)}
          onRemove={removeRaceResultAction.bind(null, school.slug, race.id)}
          onRename={renameRunnerAction.bind(null, school.slug)}
          onSearchOtherSchools={searchOtherSchoolsAction.bind(null, school.slug)}
          onClaimRunner={claimRunnerAction.bind(null, school.slug)}
        />
      )}

      {isEditable && existingResults.length === 0 && (
        <form
          action={setNoRunnersAction.bind(null, school.slug, race.id, !markedNoRunners)}
          className={`mt-4 flex flex-wrap items-center gap-2 rounded-lg p-3 ${
            markedNoRunners ? "bg-gray-100" : "border border-dashed"
          }`}
        >
          <span className="flex-1 text-sm text-gray-700">
            {markedNoRunners
              ? "✓ You've told the scorer you had no runners in this race."
              : "Nobody from your school ran in this race?"}
          </span>
          <SubmitButton className="min-h-[44px] rounded-lg bg-white px-4 text-sm font-medium ring-1 ring-gray-300">
            {markedNoRunners ? "Undo" : "No runners"}
          </SubmitButton>
        </form>
      )}

      <nav className="mt-6 grid grid-cols-2 gap-2" aria-label="Other races">
        {prev ? (
          <Link
            href={hrefFor(prev)}
            className="flex min-h-[48px] items-center rounded-lg border px-3 text-blue-700"
          >
            ← {raceLabel(prev)}
          </Link>
        ) : (
          <span />
        )}
        {next ? (
          <Link
            href={hrefFor(next)}
            className="flex min-h-[48px] items-center justify-end rounded-lg bg-blue-600 px-3 font-semibold text-white"
          >
            Next: {raceLabel(next)} →
          </Link>
        ) : (
          <span />
        )}
      </nav>
    </div>
  );
}
