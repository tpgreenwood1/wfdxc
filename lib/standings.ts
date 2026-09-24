import type { StandingsRow } from "./types";

export type PublishedResultForStandings = {
  runnerId: string;
  runnerName: string;
  position: number;
};

export type SeasonStandings = {
  qualified: StandingsRow[];
  notYetQualified: StandingsRow[];
};

/**
 * Sum of raw positions across a runner's published results this season, within one
 * (year_group, gender) category — lower total wins. A runner qualifies once their
 * racesCompleted reaches minRacesRequired; this is evaluated fresh on every call so a
 * lowered threshold retroactively re-qualifies runners with no new race required.
 */
export function computeSeasonStandings(
  rows: PublishedResultForStandings[],
  minRacesRequired: number
): SeasonStandings {
  const byRunner = new Map<
    string,
    { runnerName: string; positions: number[] }
  >();

  for (const row of rows) {
    const entry = byRunner.get(row.runnerId) ?? {
      runnerName: row.runnerName,
      positions: [],
    };
    entry.positions.push(row.position);
    byRunner.set(row.runnerId, entry);
  }

  const qualified: StandingsRow[] = [];
  const notYetQualified: StandingsRow[] = [];

  for (const [runnerId, { runnerName, positions }] of byRunner) {
    const racesCompleted = positions.length;
    const total = positions.reduce((sum, p) => sum + p, 0);
    const row: StandingsRow = { runnerId, runnerName, racesCompleted, total };
    if (racesCompleted >= minRacesRequired) {
      qualified.push(row);
    } else {
      notYetQualified.push(row);
    }
  }

  qualified.sort((a, b) => a.total - b.total);
  notYetQualified.sort((a, b) => a.total - b.total);

  return { qualified, notYetQualified };
}
