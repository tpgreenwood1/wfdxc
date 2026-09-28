import Link from "next/link";
import { getEventSummary } from "@/lib/public-results";
import { ordinal, type PodiumRunner, type PodiumTeam, type RaceSummary } from "@/lib/eventSummary";
import { raceLabel, YEAR_GROUP_ORDER } from "@/lib/raceLabels";
import HelpButton from "@/app/components/HelpButton";

const MEDALS: Record<number, string> = { 1: "🥇", 2: "🥈", 3: "🥉" };

function formatDate(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00Z`).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function Place({ place, tied }: { place: number; tied: boolean }) {
  return (
    <span className="w-14 shrink-0 tabular-nums">
      <span aria-hidden>{MEDALS[place]} </span>
      {tied ? "=" : ""}
      {ordinal(place)}
    </span>
  );
}

function RunnerLine({ runner }: { runner: PodiumRunner }) {
  return (
    <li className="flex gap-2 py-0.5">
      <Place place={runner.place} tied={runner.tied} />
      {runner.unknown ? (
        <span className="text-gray-500">Unknown runner</span>
      ) : (
        <span className="min-w-0">
          <span className="font-medium">{runner.name}</span>
          <span className="text-gray-600"> · {runner.schoolName}</span>
        </span>
      )}
    </li>
  );
}

function TeamLine({ team }: { team: PodiumTeam }) {
  return (
    <li className="flex gap-2 py-0.5">
      <Place place={team.place} tied={team.tied} />
      <span className="min-w-0">
        <span className="font-medium">{team.schoolName}</span>
        {team.runners !== null && (
          <span className="text-gray-500">
            {" "}
            ({team.runners} {team.runners === 1 ? "runner" : "runners"})
          </span>
        )}
      </span>
    </li>
  );
}

function RaceCard({ race }: { race: RaceSummary }) {
  const gender = race.gender === "boys" ? "Boys" : "Girls";
  return (
    <article className="rounded-lg border p-3">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="font-semibold">{gender}</h3>
        <span className="text-sm text-gray-600">{race.runnerCount} runners</span>
      </div>

      {race.beingCorrected && (
        <p className="mt-2 rounded bg-amber-100 p-2 text-xs text-amber-900">
          The scorer is correcting this race — it may change shortly.
        </p>
      )}

      <h4 className="mt-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
        Individual
      </h4>
      <ul className="text-sm">
        {race.individual.map((r, i) => (
          <RunnerLine key={i} runner={r} />
        ))}
      </ul>

      <h4 className="mt-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Team</h4>
      <ul className="text-sm">
        {race.teams.map((t, i) => (
          <TeamLine key={i} team={t} />
        ))}
      </ul>

      <Link
        className="mt-2 inline-flex min-h-[44px] items-center text-sm text-blue-600 underline"
        href={`/results/${race.raceId}`}
        aria-label={`Full results for ${raceLabel(race)}`}
      >
        Full results →
      </Link>
    </article>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-lg border bg-gray-50 p-3 text-center">
      <div className="text-3xl font-bold tabular-nums">{value}</div>
      <div className="text-sm text-gray-600">{label}</div>
    </div>
  );
}

export default async function EventSummaryView({
  eventId,
  eventName,
  eventDate,
  location,
}: {
  eventId: string;
  eventName: string;
  eventDate: string;
  location: string | null;
}) {
  const summary = await getEventSummary(eventId);
  const yearGroups = YEAR_GROUP_ORDER.map((yearGroup) => ({
    yearGroup,
    races: summary.races.filter((r) => r.yearGroup === yearGroup),
  })).filter((g) => g.races.length > 0);
  const hasSmallTeam = summary.races.some((r) => r.teams.some((t) => t.runners !== null));

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm">
            <Link className="text-blue-600 underline" href="/results">
              ← All events
            </Link>
          </p>
          <h1 className="text-2xl font-bold">{eventName}</h1>
          <p className="text-gray-600">
            {formatDate(eventDate)}
            {location ? ` · ${location}` : ""}
          </p>
        </div>
        <HelpButton topics={["results", "scoring"]} />
      </div>

      {summary.raceCount === 0 ? (
        <p className="rounded bg-gray-100 p-3 text-gray-600">No results published yet.</p>
      ) : (
        <>
          <section className="space-y-2">
            <div className="grid grid-cols-3 gap-2">
              <Stat value={summary.runnerCount} label="runners" />
              <Stat value={summary.schoolCount} label="schools" />
              <Stat value={summary.raceCount} label="races" />
            </div>
            <details className="rounded-lg border px-3">
              <summary className="flex min-h-[44px] cursor-pointer items-center text-sm font-medium">
                Runners from each school
              </summary>
              <ul className="divide-y pb-2 text-sm">
                {summary.runnersBySchool.map((s) => (
                  <li key={s.schoolName} className="flex justify-between py-1">
                    <span>{s.schoolName}</span>
                    <span className="tabular-nums text-gray-600">{s.runners}</span>
                  </li>
                ))}
              </ul>
            </details>
          </section>

          {yearGroups.map(({ yearGroup, races }) => (
            <section key={yearGroup}>
              <h2 className="border-b pb-1 text-lg font-bold">
                {yearGroup === "reception" ? "Reception" : yearGroup.toUpperCase()}
              </h2>
              <div className="mt-2 grid gap-3 sm:grid-cols-2">
                {races.map((race) => (
                  <RaceCard key={race.raceId} race={race} />
                ))}
              </div>
            </section>
          ))}

          {hasSmallTeam && (
            <p className="text-sm text-gray-600">
              A school&apos;s first 4 runners make its team. A full team of 4 always places
              ahead of a smaller team, so a team with fewer runners can place lower despite a
              lower points total.
            </p>
          )}
        </>
      )}
    </main>
  );
}
