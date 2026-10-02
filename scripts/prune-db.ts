import "dotenv/config";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { Pool, type PoolClient } from "@neondatabase/serverless";
import { takeBackup } from "./backup-db";
import {
  RESULT_RETENTION_YEARS,
  previousSeason,
  resultsCutoff,
  type SeasonSpan,
} from "../lib/retention";

/**
 * Applies the privacy notice's retention rules (lib/retention.ts). Run it at the start
 * of each season:
 *
 *   npm run db:prune           dry run: show what would be removed
 *   npm run db:prune -- --yes  take a "pre-prune" backup, then remove it
 *
 * 1. Events more than three years old are deleted with everything hanging off them —
 *    races, live results, tokens, and published individual/team results — so they drop
 *    out of public results and standings. A season left with no events is deleted too.
 * 2. Runners who haven't competed since the start of the previous season (and weren't
 *    added since then) are deleted, along with their aliases and live results. Their
 *    published rows keep the frozen name and lose the link to the runner (ON DELETE SET
 *    NULL), so past public results and standings are unchanged. Races that lost a live
 *    result this way are marked pruned_at so they're never republished from what's left.
 *
 * Everything happens in one transaction. Schools are never touched.
 */
async function main() {
  const confirmed = process.argv.slice(2).includes("--yes");
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const pool = new Pool({ connectionString: url });

  try {
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" });
    console.log(`Database: ${new URL(url).host}`);
    console.log(`Today:    ${today}\n`);

    if (confirmed) {
      console.log("Taking a pre-prune backup first ...");
      const safety = await takeBackup(pool, "pre-prune");
      console.log(`Saved ${safety}\n`);
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const changed = await prune(client, today);
      if (!confirmed) {
        await client.query("ROLLBACK");
        console.log(
          changed
            ? "\nDry run — nothing changed. Add --yes to remove the above (a backup is taken first)."
            : "\nNothing to remove."
        );
      } else {
        await client.query("COMMIT");
        console.log(changed ? "\nDone." : "\nNothing to remove.");
      }
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      console.error("Prune failed — rolled back, database unchanged.");
      throw err;
    } finally {
      client.release();
    }

    warnAboutOldBackups(resultsCutoff(today));
  } finally {
    await pool.end();
  }
}

/** Does the deletes inside the caller's transaction and reports them; returns whether
 * anything was removed. */
async function prune(client: PoolClient, today: string): Promise<boolean> {
  let changed = false;

  // 1. Results older than the retention period, by event date.
  const cutoff = resultsCutoff(today);
  console.log(`Results older than ${RESULT_RETENTION_YEARS} years (events before ${cutoff}):`);
  const { rows: oldEvents } = await client.query<{
    id: string;
    name: string;
    date: string;
    season: string;
    seasonId: string;
    races: number;
    results: number;
    published: number;
  }>(
    `SELECT e.id, e.name, e.date::text AS date, s.name AS season, s.id AS "seasonId",
            (SELECT count(*)::int FROM races r WHERE r.event_id = e.id) AS races,
            (SELECT count(*)::int FROM results x JOIN races r ON r.id = x.race_id WHERE r.event_id = e.id) AS results,
            (SELECT count(*)::int FROM published_individual_results p WHERE p.event_id = e.id) AS published
       FROM events e JOIN seasons s ON s.id = e.season_id
      WHERE e.date < $1::date
      ORDER BY e.date`,
    [cutoff]
  );
  if (oldEvents.length === 0) {
    console.log("  none");
  } else {
    changed = true;
    for (const e of oldEvents) {
      console.log(
        `  ${e.date}  ${e.name}  [${e.season}] — ${e.races} races, ${e.results} results, ${e.published} published`
      );
    }
    await client.query(`DELETE FROM events WHERE id = ANY($1::uuid[])`, [oldEvents.map((e) => e.id)]);

    // Only seasons this emptied — a season set up with no events yet is left alone.
    const { rows: emptied } = await client.query<{ name: string }>(
      `DELETE FROM seasons s
        WHERE s.id = ANY($1::uuid[])
          AND NOT EXISTS (SELECT 1 FROM events e WHERE e.season_id = s.id)
        RETURNING s.name`,
        [[...new Set(oldEvents.map((e) => e.seasonId))]]
    );
    for (const s of emptied) console.log(`  season "${s.name}" now has no events — deleted`);
  }

  // 2. Runner records not used since the previous season started.
  const { rows: spans } = await client.query<SeasonSpan>(
    `SELECT s.id, s.name, min(e.date)::text AS "firstEventDate", max(e.date)::text AS "lastEventDate"
       FROM seasons s JOIN events e ON e.season_id = s.id
      GROUP BY s.id, s.name`
  );
  const prev = previousSeason(spans, today);
  console.log("\nRunner records:");
  if (!prev) {
    console.log("  no season has finished yet — nothing to check");
    return changed;
  }
  const keepFrom = prev.firstEventDate;
  console.log(
    `  previous season is "${prev.name}" (${prev.firstEventDate} to ${prev.lastEventDate}); ` +
      `removing runners with no result since ${keepFrom} who were added before then`
  );

  const { rows: stale } = await client.query<{ id: string; school: string }>(
    `SELECT r.id, s.name AS school
       FROM runners r JOIN schools s ON s.id = r.school_id
      WHERE r.created_at < $1::date
        AND NOT EXISTS (
          SELECT 1 FROM results x
            JOIN races ra ON ra.id = x.race_id
            JOIN events e ON e.id = ra.event_id
           WHERE x.runner_id = r.id AND e.date >= $1::date
        )`,
    [keepFrom]
  );
  if (stale.length === 0) {
    console.log("  none");
    return changed;
  }

  const bySchool = new Map<string, number>();
  for (const r of stale) bySchool.set(r.school, (bySchool.get(r.school) ?? 0) + 1);
  for (const [school, n] of [...bySchool].sort((a, b) => a[0].localeCompare(b[0]))) {
    console.log(`  ${school.padEnd(40)} ${n}`);
  }

  const ids = stale.map((r) => r.id);
  const { rows: archived } = await client.query<{ n: number }>(
    `WITH marked AS (
       UPDATE races SET pruned_at = now()
        WHERE id IN (SELECT DISTINCT race_id FROM results WHERE runner_id = ANY($1::uuid[]))
          AND pruned_at IS NULL
       RETURNING 1)
     SELECT count(*)::int AS n FROM marked`,
    [ids]
  );
  const { rows: results } = await client.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM results WHERE runner_id = ANY($1::uuid[])`,
    [ids]
  );
  await client.query(`DELETE FROM runners WHERE id = ANY($1::uuid[])`, [ids]);
  console.log(
    `  ${stale.length} runners (and ${results[0].n} live results) — published results keep their names; ` +
      `${archived[0].n} races newly archived`
  );
  return true;
}

/** db:backup files keep everything they had, so ones older than the retention period
 * would still hold data the notice says is gone. */
function warnAboutOldBackups(cutoff: string) {
  const dir = join(process.cwd(), "backups");
  let files: string[];
  try {
    files = readdirSync(dir).filter((f) => f.endsWith(".json"));
  } catch {
    return;
  }
  const old = files.filter((f) => statSync(join(dir, f)).mtime.toISOString().slice(0, 10) < cutoff);
  if (old.length === 0) return;
  console.log(`\n${old.length} backup file(s) in backups/ are from before ${cutoff} — delete them (and any copies):`);
  for (const f of old) console.log(`  ${f}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
