/**
 * Data-retention rules from the privacy notice (/privacy), applied by `npm run db:prune`:
 *
 * - A runner record is removed if the child hasn't competed in the previous league
 *   season (or since). Runners added since that season started are kept even with no
 *   results yet, so a roster set up for the new season survives.
 * - Results are kept for three years, then deleted (by event date).
 *
 * Pure so the date/season choices are testable; the deletes live in scripts/prune-db.ts.
 */

export const RESULT_RETENTION_YEARS = 3;

export type SeasonSpan = {
  id: string;
  name: string;
  firstEventDate: string; // YYYY-MM-DD
  lastEventDate: string; // YYYY-MM-DD
};

/** The most recent season whose events are all before `today` — the "previous season"
 * when run at the start of a new one (whether or not the new season has been set up or
 * has already had its first event). Null if no season has finished yet. */
export function previousSeason(seasons: SeasonSpan[], today: string): SeasonSpan | null {
  let best: SeasonSpan | null = null;
  for (const s of seasons) {
    if (s.lastEventDate >= today) continue;
    if (!best || s.lastEventDate > best.lastEventDate) best = s;
  }
  return best;
}

/** Events dated before this (YYYY-MM-DD) are past the results retention period. */
export function resultsCutoff(today: string, years = RESULT_RETENTION_YEARS): string {
  const [y, m, d] = today.split("-").map(Number);
  // 29 Feb rolls to 1 Mar in a non-leap year, which only makes the cutoff a day later.
  const cutoff = new Date(Date.UTC(y - years, m - 1, d));
  return cutoff.toISOString().slice(0, 10);
}
