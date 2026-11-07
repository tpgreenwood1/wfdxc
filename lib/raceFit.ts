// Pure — imported by client components (SubmitForm), so keep DB imports out of here.
//
// "Is this child in the right race?" Runners don't store a year group or gender, so the
// only evidence is where they've raced before. Used to warn (never block) a teacher who
// is entering runners into the wrong race — e.g. a whole school's sheet typed into
// Reception Girls because that's the page that was open.

import { raceLabel, YEAR_GROUP_ORDER } from "./raceLabels";

export type RaceRef = {
  raceId: string;
  eventId: string;
  seasonId: string;
  /** YYYY-MM-DD */
  eventDate: string;
  yearGroup: string;
  gender: string;
};

/** One past (or same-day) result for a runner, as read by `getRunnerRaceHistory`. */
export type RunnerRaceHistoryRow = RaceRef & { runnerId: string; eventName: string };

export type RunnerRaceHint = {
  /** Other races this runner is already entered in at this event. */
  otherRacesToday: { raceId: string; label: string }[];
  /** The most recent race they ran at an earlier event. */
  lastRan: { label: string; eventName: string } | null;
  /** Their last race suggests a different year group or gender from this one. */
  lastRanMismatch: boolean;
};

/** Whether `last` (an earlier race) points to a different race from `current`. Gender
 * must match. Within a season the year group should be the same; in a later season it
 * should have gone up, since children move up a year each September. */
export function isRaceMismatch(
  current: Pick<RaceRef, "seasonId" | "yearGroup" | "gender">,
  last: Pick<RaceRef, "seasonId" | "yearGroup" | "gender">
): boolean {
  if (current.gender !== last.gender) return true;
  const now = YEAR_GROUP_ORDER.indexOf(current.yearGroup);
  const then = YEAR_GROUP_ORDER.indexOf(last.yearGroup);
  return current.seasonId === last.seasonId ? now !== then : now <= then;
}

/** Builds a hint for every runner with any history. Runners with none are left out. */
export function buildRunnerHints(
  current: RaceRef,
  history: RunnerRaceHistoryRow[]
): Record<string, RunnerRaceHint> {
  const byRunner = new Map<string, RunnerRaceHistoryRow[]>();
  for (const row of history) {
    if (row.raceId === current.raceId) continue;
    const list = byRunner.get(row.runnerId) ?? [];
    list.push(row);
    byRunner.set(row.runnerId, list);
  }

  const hints: Record<string, RunnerRaceHint> = {};
  for (const [runnerId, rows] of byRunner) {
    const today = rows.filter((r) => r.eventId === current.eventId);
    const earlier = rows
      .filter((r) => r.eventId !== current.eventId && r.eventDate <= current.eventDate)
      .sort((a, b) => b.eventDate.localeCompare(a.eventDate));
    const last = earlier[0];
    if (today.length === 0 && !last) continue;
    hints[runnerId] = {
      otherRacesToday: today.map((r) => ({ raceId: r.raceId, label: raceLabel(r) })),
      lastRan: last ? { label: raceLabel(last), eventName: last.eventName } : null,
      lastRanMismatch: last ? isRaceMismatch(current, last) : false,
    };
  }
  return hints;
}

/** Whether a runner should carry a warning on this race's form. */
export function needsWarning(hint: RunnerRaceHint | undefined): boolean {
  return !!hint && (hint.otherRacesToday.length > 0 || hint.lastRanMismatch);
}

/** How many entered runners must look out of place before the form asks "Are you on
 * the right race?" — one could be a genuine exception, two is a pattern. */
export const WRONG_RACE_BANNER_THRESHOLD = 2;

/** The races the out-of-place runners point to, most common first, for the banner. */
export function summariseMismatches(
  hints: (RunnerRaceHint | undefined)[]
): { label: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const hint of hints) {
    if (!hint || !needsWarning(hint)) continue;
    const label = hint.otherRacesToday[0]?.label ?? hint.lastRan?.label;
    if (label) counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...counts]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);
}
