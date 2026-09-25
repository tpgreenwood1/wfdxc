/**
 * Flags the things a scorer has to look at in one race's results: places claimed by
 * more than one runner (duplicates) and places nobody claimed (gaps). Pure, so the
 * race page, event board and dashboard all agree on what counts as an open issue.
 *
 * An admin acknowledgement turns a flag into an accepted state rather than hiding
 * it: a 'tie' ack means both runners keep that place (league rule), a 'gap' ack
 * means nobody from a league school finished there. Acks for a place that's no
 * longer flagged (e.g. the duplicate was since fixed) are simply ignored.
 */

export type IssueRow = { id: string; position: number };
export type PositionAck = { position: number; kind: "tie" | "gap"; note?: string | null };

export type DuplicateIssue = {
  position: number;
  resultIds: string[];
  acknowledged: boolean;
};

export type GapIssue = {
  position: number;
  acknowledged: boolean;
  note: string | null;
};

export type RaceIssues = {
  duplicates: DuplicateIssue[];
  gaps: GapIssue[];
  openDuplicates: number;
  openGaps: number;
  openCount: number;
};

export function findRaceIssues(rows: IssueRow[], acks: PositionAck[] = []): RaceIssues {
  const tieAcks = new Set(acks.filter((a) => a.kind === "tie").map((a) => a.position));
  const gapAcks = new Map(
    acks.filter((a) => a.kind === "gap").map((a) => [a.position, a.note ?? null])
  );

  const byPosition = new Map<number, string[]>();
  for (const row of rows) {
    const list = byPosition.get(row.position) ?? [];
    list.push(row.id);
    byPosition.set(row.position, list);
  }

  const duplicates: DuplicateIssue[] = [...byPosition.entries()]
    .filter(([, ids]) => ids.length > 1)
    .sort(([a], [b]) => a - b)
    .map(([position, resultIds]) => ({
      position,
      resultIds,
      acknowledged: tieAcks.has(position),
    }));

  // Every place from 1 up to the last one claimed should belong to someone.
  const maxPosition = rows.reduce((max, r) => Math.max(max, r.position), 0);
  const gaps: GapIssue[] = [];
  for (let p = 1; p < maxPosition; p++) {
    if (!byPosition.has(p)) {
      gaps.push({ position: p, acknowledged: gapAcks.has(p), note: gapAcks.get(p) ?? null });
    }
  }

  const openDuplicates = duplicates.filter((d) => !d.acknowledged).length;
  const openGaps = gaps.filter((g) => !g.acknowledged).length;
  return { duplicates, gaps, openDuplicates, openGaps, openCount: openDuplicates + openGaps };
}

/** "=5th" for an accepted shared place, "5th" otherwise. */
export function ordinal(n: number, shared = false): string {
  const mod100 = n % 100;
  const suffix =
    mod100 >= 11 && mod100 <= 13
      ? "th"
      : n % 10 === 1
        ? "st"
        : n % 10 === 2
          ? "nd"
          : n % 10 === 3
            ? "rd"
            : "th";
  return `${shared ? "=" : ""}${n}${suffix}`;
}

export function describeIssues(issues: Pick<RaceIssues, "openDuplicates" | "openGaps">): string[] {
  const parts: string[] = [];
  if (issues.openDuplicates > 0) {
    parts.push(
      `${issues.openDuplicates} duplicate place${issues.openDuplicates === 1 ? "" : "s"}`
    );
  }
  if (issues.openGaps > 0) {
    parts.push(`${issues.openGaps} missing place${issues.openGaps === 1 ? "" : "s"}`);
  }
  return parts;
}
