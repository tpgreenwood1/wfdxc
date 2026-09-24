import type { ResultRow, TeamResult } from "./types";

const MAX_SCORERS = 4;

/** Sort a race's results by finishing position. That's the full individual result. */
export function computeIndividualResults(rows: ResultRow[]): ResultRow[] {
  return [...rows].sort((a, b) => a.position - b.position);
}

/**
 * Team scoring, per race per school. Ranked by scoringCount DESC (a team of 4 always
 * beats a team of 3, regardless of scoreSum), then scoreSum ASC as a tiebreaker only
 * within equal scoringCount. Minimum 1 finisher to field a scoring team.
 */
export function computeTeamResults(rows: ResultRow[]): TeamResult[] {
  const bySchool = new Map<string, ResultRow[]>();
  for (const row of rows) {
    const list = bySchool.get(row.schoolId) ?? [];
    list.push(row);
    bySchool.set(row.schoolId, list);
  }

  const unranked: Omit<TeamResult, "rank">[] = [];
  for (const [schoolId, schoolRows] of bySchool) {
    if (schoolRows.length === 0) continue;
    const sorted = [...schoolRows].sort((a, b) => a.position - b.position);
    const scorers = sorted.slice(0, MAX_SCORERS);
    unranked.push({
      schoolId,
      schoolName: sorted[0].schoolName,
      scoringCount: scorers.length,
      scoreSum: scorers.reduce((sum, r) => sum + r.position, 0),
    });
  }

  unranked.sort((a, b) => {
    if (a.scoringCount !== b.scoringCount) return b.scoringCount - a.scoringCount;
    return a.scoreSum - b.scoreSum;
  });

  const ranked: TeamResult[] = [];
  let currentRank = 0;
  let seen = 0;
  let prev: { scoringCount: number; scoreSum: number } | null = null;
  for (const team of unranked) {
    seen += 1;
    if (
      !prev ||
      prev.scoringCount !== team.scoringCount ||
      prev.scoreSum !== team.scoreSum
    ) {
      currentRank = seen;
    }
    prev = { scoringCount: team.scoringCount, scoreSum: team.scoreSum };
    ranked.push({ ...team, rank: currentRank });
  }

  return ranked;
}
