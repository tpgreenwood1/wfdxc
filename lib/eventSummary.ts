/**
 * Builds an event's results summary (headline numbers + each race's top three) from
 * its published rows. Pure — the DB read is `getEventSummary` in public-results.ts —
 * so it's safe to import from client code and easy to test.
 */

import { sortRaces } from "./raceLabels";

export type SummaryRace = {
  raceId: string;
  yearGroup: string;
  gender: string;
  /** Reopened by the scorer: still shows its last published results. */
  beingCorrected: boolean;
};

export type SummaryIndividualRow = {
  raceId: string;
  runnerId: string | null;
  runnerName: string;
  schoolId: string | null;
  schoolName: string;
  position: number;
};

export type SummaryTeamRow = {
  raceId: string;
  schoolName: string;
  scoringCount: number;
  rank: number;
};

const PODIUM_PLACES = 3;
const FULL_TEAM = 4;

export type PodiumRunner = {
  place: number;
  /** Shares the place with another runner — shown as "=2nd". */
  tied: boolean;
  /** No league runner finished here (the scorer marked the place "no one to add"). */
  unknown: boolean;
  name: string;
  schoolName: string | null;
};

export type PodiumTeam = {
  place: number;
  tied: boolean;
  schoolName: string;
  /** Set when fewer than a full team scored, so the page can explain the ranking. */
  runners: number | null;
};

export type RaceSummary = SummaryRace & {
  runnerCount: number;
  individual: PodiumRunner[];
  teams: PodiumTeam[];
};

export type EventSummary = {
  runnerCount: number;
  schoolCount: number;
  raceCount: number;
  /** Most runners first, then by name. */
  runnersBySchool: { schoolName: string; runners: number }[];
  /** Reception → Y6, boys before girls. */
  races: RaceSummary[];
};

/** "Alexander Smith" → "Alexander S." — how every public page (summary, full race
 * results, standings) shows a runner, so children's full names aren't on the open
 * web. Teachers still see full names behind their school code. */
export function shortName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`;
}

export function ordinal(n: number): string {
  const lastTwo = n % 100;
  if (lastTwo >= 11 && lastTwo <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

/**
 * Top three places of one race. A place nobody holds is "Unknown runner" when a
 * non-league runner must have taken it (someone finished behind it and there aren't
 * enough ties ahead to explain the skip, e.g. 1, 2, 4) — but not when a tie skipped
 * it (1, 1, 3) or the race simply had fewer runners.
 */
function individualPodium(rows: SummaryIndividualRow[]): PodiumRunner[] {
  const sorted = [...rows].sort((a, b) => a.position - b.position);
  const lastPosition = sorted.at(-1)?.position ?? 0;

  const podium: PodiumRunner[] = [];
  for (let place = 1; place <= PODIUM_PLACES; place++) {
    const here = sorted.filter((r) => r.position === place);
    if (here.length > 0) {
      for (const r of here) {
        podium.push({
          place,
          tied: here.length > 1,
          unknown: false,
          name: shortName(r.runnerName),
          schoolName: r.schoolName,
        });
      }
      continue;
    }
    const ahead = sorted.filter((r) => r.position < place).length;
    if (ahead < place && lastPosition > place) {
      podium.push({ place, tied: false, unknown: true, name: "Unknown runner", schoolName: null });
    }
  }
  return podium;
}

function teamPodium(rows: SummaryTeamRow[]): PodiumTeam[] {
  const countAt = new Map<number, number>();
  for (const t of rows) countAt.set(t.rank, (countAt.get(t.rank) ?? 0) + 1);
  return [...rows]
    .filter((t) => t.rank <= PODIUM_PLACES)
    .sort((a, b) => a.rank - b.rank || a.schoolName.localeCompare(b.schoolName))
    .map((t) => ({
      place: t.rank,
      tied: (countAt.get(t.rank) ?? 0) > 1,
      schoolName: t.schoolName,
      runners: t.scoringCount < FULL_TEAM ? t.scoringCount : null,
    }));
}

export function summariseEvent(
  races: SummaryRace[],
  individual: SummaryIndividualRow[],
  teams: SummaryTeamRow[]
): EventSummary {
  const raceIds = new Set(races.map((r) => r.raceId));
  const rows = individual.filter((r) => raceIds.has(r.raceId));

  // Published ids are soft references (a pruned runner/school becomes null), so fall
  // back to the frozen name to keep counting them.
  const runnerKeys = new Set(
    rows.map((r) => r.runnerId ?? `name:${r.runnerName}|${r.schoolName}`)
  );
  const schoolKeys = new Set(rows.map((r) => r.schoolId ?? `name:${r.schoolName}`));

  const perSchool = new Map<string, number>();
  for (const r of rows) perSchool.set(r.schoolName, (perSchool.get(r.schoolName) ?? 0) + 1);
  const runnersBySchool = [...perSchool.entries()]
    .map(([schoolName, runners]) => ({ schoolName, runners }))
    .sort((a, b) => b.runners - a.runners || a.schoolName.localeCompare(b.schoolName));

  const rowsByRace = new Map<string, SummaryIndividualRow[]>();
  for (const r of rows) {
    const list = rowsByRace.get(r.raceId) ?? [];
    list.push(r);
    rowsByRace.set(r.raceId, list);
  }
  const teamsByRace = new Map<string, SummaryTeamRow[]>();
  for (const t of teams) {
    const list = teamsByRace.get(t.raceId) ?? [];
    list.push(t);
    teamsByRace.set(t.raceId, list);
  }

  return {
    runnerCount: runnerKeys.size,
    schoolCount: schoolKeys.size,
    raceCount: races.length,
    runnersBySchool,
    races: sortRaces([...races]).map((race) => {
      const raceRows = rowsByRace.get(race.raceId) ?? [];
      return {
        ...race,
        runnerCount: raceRows.length,
        individual: individualPodium(raceRows),
        teams: teamPodium(teamsByRace.get(race.raceId) ?? []),
      };
    }),
  };
}
