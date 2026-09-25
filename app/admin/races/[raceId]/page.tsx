import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { events, schools, submissionTokens, races } from "@/db/schema";
import { getRaceResultsForAdmin } from "@/lib/results";
import { isDiverged } from "@/lib/publish";
import { computeTeamResults } from "@/lib/scoring";
import { getPositionAcks, raceLabel, sortRaces } from "@/lib/races";
import { describeIssues, findRaceIssues, ordinal } from "@/lib/raceIssues";
import {
  getConfirmedStatesForRace,
  raceReadiness,
  schoolRaceState,
  type SchoolRaceState,
} from "@/lib/raceSchoolStatus";
import { formatEventDate } from "@/lib/events";
import { isUuid } from "@/lib/ids";
import RaceResultsTable from "./RaceResultsTable";
import CopyLinkButton from "@/app/components/CopyLinkButton";
import StatusBadge from "@/app/components/StatusBadge";
import ConfirmSubmitButton from "@/app/components/ConfirmSubmitButton";
import {
  regenerateTokenAction,
  republishAction,
  setSchoolStateAction,
  setStatusAction,
} from "./actions";

export const dynamic = "force-dynamic";

const STATE_LABEL: Record<SchoolRaceState, string> = {
  done: "Done",
  no_runners: "No runners",
  entering: "Entering",
  not_started: "Nothing yet",
};

const STATE_STYLE: Record<SchoolRaceState, string> = {
  done: "bg-green-100 text-green-800",
  no_runners: "bg-gray-100 text-gray-600",
  entering: "bg-blue-100 text-blue-800",
  not_started: "bg-amber-100 text-amber-900",
};

export default async function RacePage({ params }: { params: { raceId: string } }) {
  if (!isUuid(params.raceId)) notFound();
  const db = getDb();
  const [race] = await db.select().from(races).where(eq(races.id, params.raceId));
  if (!race) notFound();

  const [event, siblings, resultRows, acks, confirmed, tokens, diverged, allSchools] =
    await Promise.all([
      db.select().from(events).where(eq(events.id, race.eventId)).then((r) => r[0]),
      db
        .select({ id: races.id, yearGroup: races.yearGroup, gender: races.gender })
        .from(races)
        .where(eq(races.eventId, race.eventId)),
      getRaceResultsForAdmin(params.raceId),
      getPositionAcks(params.raceId),
      getConfirmedStatesForRace(params.raceId),
      db
        .select({
          id: submissionTokens.id,
          token: submissionTokens.token,
          schoolName: schools.name,
        })
        .from(submissionTokens)
        .innerJoin(schools, eq(submissionTokens.schoolId, schools.id))
        .where(eq(submissionTokens.raceId, params.raceId))
        .orderBy(schools.name),
      race.status === "closed" ? isDiverged(params.raceId) : Promise.resolve(false),
      db.select({ id: schools.id, name: schools.name }).from(schools).orderBy(schools.name),
    ]);

  sortRaces(siblings);
  const index = siblings.findIndex((r) => r.id === race.id);
  const prev = siblings[index - 1];
  const next = siblings[index + 1];

  const issues = findRaceIssues(resultRows, acks);
  const teams = computeTeamResults(resultRows);
  const sharedTeamRanks = new Set(
    teams.filter((t, _i, all) => all.filter((o) => o.rank === t.rank).length > 1).map((t) => t.rank)
  );

  const enteredBySchool = new Map<string, number>();
  for (const r of resultRows) enteredBySchool.set(r.schoolId, (enteredBySchool.get(r.schoolId) ?? 0) + 1);
  const schoolStates = allSchools.map((s) => ({
    ...s,
    entered: enteredBySchool.get(s.id) ?? 0,
    state: schoolRaceState(enteredBySchool.get(s.id) ?? 0, confirmed.get(s.id)),
  }));
  const readiness = raceReadiness({
    openIssues: issues.openCount,
    totalEntries: resultRows.length,
    schoolStates: schoolStates.map((s) => s.state),
  });

  const warnings = [
    ...describeIssues(issues),
    ...(readiness.notStarted > 0
      ? [`${readiness.notStarted} school(s) haven't entered anything or said they had no runners`]
      : []),
    ...(readiness.entering > 0
      ? [`${readiness.entering} school(s) are still entering (haven't tapped "done")`]
      : []),
    ...(resultRows.length === 0 ? ["no results have been entered"] : []),
  ];
  const finaliseMessage =
    warnings.length === 0
      ? `Finalise ${raceLabel(race)}? Results go live on the public page and count towards standings. You can still correct them afterwards.`
      : `Finalise ${raceLabel(race)} anyway?\n\nStill outstanding:\n• ${warnings.join("\n• ")}\n\nYou can still correct results afterwards — the public page updates automatically.`;

  const issueLinks = [
    ...issues.duplicates
      .filter((d) => !d.acknowledged)
      .map((d) => ({ position: d.position, label: `${ordinal(d.position)} claimed ${d.resultIds.length}×` })),
    ...issues.gaps
      .filter((g) => !g.acknowledged)
      .map((g) => ({ position: g.position, label: `${ordinal(g.position)} missing` })),
  ].sort((a, b) => a.position - b.position);

  return (
    <main className="mx-auto max-w-4xl space-y-4 p-4 pb-24 sm:p-6">
      <div className="space-y-2">
        <Link href={`/admin/events/${race.eventId}`} className="text-sm text-blue-600 underline">
          ← {event?.name}
          {event && ` · ${formatEventDate(event.date)}`}
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-2xl font-bold">
            {raceLabel(race)} <StatusBadge status={race.status} />
          </h1>
          <nav className="flex gap-2 text-sm">
            {prev ? (
              <Link className="rounded bg-gray-100 px-3 py-2" href={`/admin/races/${prev.id}`}>
                ← {raceLabel(prev)}
              </Link>
            ) : null}
            {next ? (
              <Link className="rounded bg-gray-100 px-3 py-2" href={`/admin/races/${next.id}`}>
                {raceLabel(next)} →
              </Link>
            ) : null}
          </nav>
        </div>
      </div>

      {/* What needs doing, and the main action for this race's state. */}
      <section className="space-y-2 rounded border p-3">
        {issueLinks.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-medium text-red-800">To check:</span>
            {issueLinks.map((l) => (
              <a
                key={l.label}
                href={`#pos-${l.position}`}
                className="rounded bg-red-100 px-2 py-1 text-red-900 underline"
              >
                {l.label}
              </a>
            ))}
          </div>
        ) : resultRows.length > 0 ? (
          <p className="text-sm text-green-800">✓ No duplicate or missing places.</p>
        ) : null}
        <p className="text-sm text-gray-700">
          {resultRows.length} runner{resultRows.length === 1 ? "" : "s"} ·{" "}
          {schoolStates.filter((s) => s.state === "done" || s.state === "no_runners").length} of{" "}
          {allSchools.length} schools confirmed
          {readiness.notStarted > 0 && (
            <span className="text-amber-800"> · {readiness.notStarted} with nothing yet</span>
          )}
        </p>

        <div className="flex flex-wrap items-center gap-2">
          {race.status === "open" && (
            <form action={setStatusAction}>
              <input type="hidden" name="raceId" value={race.id} />
              <input type="hidden" name="status" value="closed" />
              <ConfirmSubmitButton
                confirmMessage={finaliseMessage}
                className={`min-h-[44px] rounded px-4 font-medium text-white ${
                  readiness.ready ? "bg-green-700" : "bg-gray-800"
                }`}
              >
                {readiness.ready ? "Finalise race ✓" : "Finalise race…"}
              </ConfirmSubmitButton>
            </form>
          )}
          {race.status === "closed" && (
            <p className="text-sm text-gray-700">
              Finalised — results are public.{" "}
              <Link className="text-blue-600 underline" href={`/results/${race.id}`}>
                View public page
              </Link>
              . Corrections below update it straight away.
            </p>
          )}
          {race.status === "cancelled" && (
            <p className="text-sm text-gray-700">Cancelled — not shown publicly or counted in standings.</p>
          )}
          <details className="text-sm">
            <summary className="cursor-pointer px-2 py-2 text-gray-600">More…</summary>
            <div className="mt-1 flex flex-wrap gap-2">
              {race.status !== "open" && (
                <StatusForm raceId={race.id} status="open" label="Reopen for teachers"
                  message="Reopen this race? Teachers can edit their entries again. The public results stay up until you finalise again." />
              )}
              {race.status !== "cancelled" && (
                <StatusForm raceId={race.id} status="cancelled" label="Cancel race"
                  message="Cancel this race (e.g. weather)? It's hidden from public results and doesn't count towards anyone's races completed." />
              )}
              {race.status === "closed" && (
                <form action={republishAction}>
                  <input type="hidden" name="raceId" value={race.id} />
                  <button className="min-h-[40px] rounded bg-gray-100 px-3" type="submit">
                    Republish now
                  </button>
                </form>
              )}
            </div>
          </details>
        </div>
        {diverged && (
          <div className="flex flex-wrap items-center gap-3 rounded bg-amber-100 p-2 text-sm text-amber-900">
            <span>The public page is out of date with these results.</span>
            <form action={republishAction}>
              <input type="hidden" name="raceId" value={race.id} />
              <button className="rounded bg-amber-900 px-3 py-1 text-white" type="submit">
                Update public results
              </button>
            </form>
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-[1fr_260px] md:items-start">
        <section>
          <h2 className="mb-2 font-semibold">Results</h2>
          <RaceResultsTable
            raceId={race.id}
            initialRows={resultRows}
            initialAcks={acks}
            allSchools={allSchools}
          />
        </section>

        <div className="space-y-4">
          <section className="rounded border p-3">
            <h2 className="font-semibold">Team places</h2>
            <p className="text-xs text-gray-500">
              Best 4 per school. Equal teams share a place; the next place is skipped.
            </p>
            <table className="mt-2 w-full text-sm">
              <thead>
                <tr className="text-left">
                  <th className="py-1">Place</th>
                  <th className="py-1">School</th>
                  <th className="py-1" title="Runners counted">Ran</th>
                  <th className="py-1">Pts</th>
                </tr>
              </thead>
              <tbody>
                {teams.map((t) => (
                  <tr key={t.schoolId} className="border-t">
                    <td className="py-1">{ordinal(t.rank, sharedTeamRanks.has(t.rank))}</td>
                    <td className="py-1">{t.schoolName}</td>
                    <td className="py-1">{t.scoringCount}</td>
                    <td className="py-1">{t.scoreSum}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {teams.length === 0 && <p className="mt-2 text-sm text-gray-500">No results yet.</p>}
          </section>

          <details className="rounded border p-3" open={readiness.notStarted > 0}>
            <summary className="cursor-pointer font-semibold">Schools in this race</summary>
            <ul className="mt-2 divide-y text-sm">
              {schoolStates.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center gap-2 py-1.5">
                  <span className="flex-1">
                    {s.name}
                    {s.entered > 0 && <span className="text-gray-500"> · {s.entered}</span>}
                  </span>
                  <span className={`rounded px-1.5 py-0.5 text-xs ${STATE_STYLE[s.state]}`}>
                    {STATE_LABEL[s.state]}
                  </span>
                  {s.state === "not_started" && (
                    <SchoolStateButton raceId={race.id} schoolId={s.id} state="no_runners" label="No runners" />
                  )}
                  {s.state === "entering" && (
                    <SchoolStateButton raceId={race.id} schoolId={s.id} state="done" label="Mark done" />
                  )}
                  {(s.state === "done" || s.state === "no_runners") && confirmed.has(s.id) && (
                    <SchoolStateButton raceId={race.id} schoolId={s.id} state="" label="Undo" />
                  )}
                </li>
              ))}
            </ul>
          </details>
        </div>
      </div>

      <details className="rounded border p-3 text-sm">
        <summary className="cursor-pointer text-gray-600">Older per-race entry links</summary>
        <p className="mt-1 text-xs text-gray-500">
          Only needed for a school still using an old per-race link. Normally send the school's
          teacher link from the Schools page.
        </p>
        <ul className="mt-2 space-y-1">
          {tokens.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center gap-2">
              <span className="w-40">{t.schoolName}</span>
              <CopyLinkButton path={`/submit/${t.token}`} />
              <form action={regenerateTokenAction}>
                <input type="hidden" name="raceId" value={race.id} />
                <input type="hidden" name="tokenId" value={t.id} />
                <button className="rounded bg-gray-200 px-2 py-0.5 text-xs" type="submit">
                  Regenerate
                </button>
              </form>
            </li>
          ))}
        </ul>
      </details>
    </main>
  );
}

function StatusForm({
  raceId,
  status,
  label,
  message,
}: {
  raceId: string;
  status: string;
  label: string;
  message: string;
}) {
  return (
    <form action={setStatusAction}>
      <input type="hidden" name="raceId" value={raceId} />
      <input type="hidden" name="status" value={status} />
      <ConfirmSubmitButton confirmMessage={message} className="min-h-[40px] rounded bg-gray-100 px-3">
        {label}
      </ConfirmSubmitButton>
    </form>
  );
}

function SchoolStateButton({
  raceId,
  schoolId,
  state,
  label,
}: {
  raceId: string;
  schoolId: string;
  state: string;
  label: string;
}) {
  return (
    <form action={setSchoolStateAction}>
      <input type="hidden" name="raceId" value={raceId} />
      <input type="hidden" name="schoolId" value={schoolId} />
      <input type="hidden" name="state" value={state} />
      <button type="submit" className="min-h-[32px] rounded bg-gray-100 px-2 text-xs">
        {label}
      </button>
    </form>
  );
}
