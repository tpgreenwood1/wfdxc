import "dotenv/config";
import { readFileSync } from "node:fs";
import { Pool } from "@neondatabase/serverless";
import { listSchema, takeBackup, type BackupFile } from "./backup-db";

/**
 * Puts the whole database back to the state in a db:backup file. Every table is wiped
 * and reloaded from the file in one transaction — it either fully succeeds or nothing
 * changes. Anything entered since the backup is lost, so a fresh "pre-restore" backup
 * of the current state is taken first (you can restore that if you picked the wrong file).
 *
 *   npm run db:restore -- backups/<file>.json          dry run: compare file vs live DB
 *   npm run db:restore -- backups/<file>.json --yes    actually restore
 *
 * Refuses if the file's tables/columns don't match the live schema (e.g. the backup was
 * taken before a later migration) — restoring into a different schema isn't safe.
 */
async function main() {
  const args = process.argv.slice(2);
  const confirmed = args.includes("--yes");
  const path = args.find((a) => !a.startsWith("--"));
  if (!path) {
    console.error("Usage: npm run db:restore -- backups/<file>.json [--yes]");
    process.exit(1);
  }

  const backup = JSON.parse(readFileSync(path, "utf8")) as BackupFile;
  if (backup.format !== "wfdxc-backup/1") {
    console.error(`${path} is not a db:backup file.`);
    process.exit(1);
  }

  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const pool = new Pool({ connectionString: url });

  try {
    const liveSchema = await listSchema(pool);
    const problems = diffSchema(backup.schema, liveSchema);
    if (problems.length > 0) {
      console.error("Backup schema doesn't match the live database — not restoring:");
      for (const p of problems) console.error(`  ${p}`);
      process.exit(1);
    }

    const tables = await insertOrder(pool, Object.keys(backup.tables));

    console.log(`Database: ${new URL(url).host}`);
    console.log(`Backup:   ${path}`);
    console.log(`Taken:    ${backup.createdAt}${backup.label ? `  (${backup.label})` : ""}\n`);
    console.log(`  ${"table".padEnd(30)} ${"now".padStart(7)} ${"backup".padStart(7)}`);
    for (const t of tables) {
      const { rows } = await pool.query<{ n: string }>(`SELECT count(*) AS n FROM "${t}"`);
      const now = Number(rows[0].n);
      const then = backup.tables[t].length;
      console.log(`  ${t.padEnd(30)} ${String(now).padStart(7)} ${String(then).padStart(7)}${now !== then ? "  *" : ""}`);
    }

    if (!confirmed) {
      console.log("\nDry run — nothing changed. Add --yes to replace ALL data with this backup.");
      return;
    }

    console.log("\nTaking a pre-restore backup of the current state first ...");
    const safety = await takeBackup(pool, "pre-restore");
    console.log(`Saved ${safety}\n`);

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`TRUNCATE ${tables.map((t) => `"${t}"`).join(", ")}`);
      for (const t of tables) {
        const rows = backup.tables[t];
        if (rows.length === 0) continue;
        await client.query(
          `INSERT INTO "${t}" SELECT * FROM json_populate_recordset(NULL::"${t}", $1::json)`,
          [JSON.stringify(rows)]
        );
      }
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      console.error("Restore failed — rolled back, database unchanged.");
      throw err;
    } finally {
      client.release();
    }

    console.log(`Restored ${tables.length} tables from ${path}.`);
  } finally {
    await pool.end();
  }
}

function diffSchema(backup: Record<string, string[]>, live: Record<string, string[]>): string[] {
  const problems: string[] = [];
  for (const t of new Set([...Object.keys(backup), ...Object.keys(live)])) {
    if (!live[t]) problems.push(`table "${t}" is in the backup but not the database`);
    else if (!backup[t]) problems.push(`table "${t}" is in the database but not the backup`);
    else if (backup[t].join() !== live[t].join()) {
      problems.push(`table "${t}" columns differ:\n      backup: ${backup[t].join(", ")}\n      live:   ${live[t].join(", ")}`);
    }
  }
  return problems;
}

/** Orders tables so every table comes after the tables its foreign keys point at. */
async function insertOrder(pool: Pool, tables: string[]): Promise<string[]> {
  const { rows } = await pool.query<{ child: string; parent: string }>(
    `SELECT c.conrelid::regclass::text AS child, c.confrelid::regclass::text AS parent
       FROM pg_constraint c
       JOIN pg_namespace n ON n.oid = c.connamespace
      WHERE c.contype = 'f' AND n.nspname = 'public'`
  );
  const unquote = (s: string) => s.replace(/^"|"$/g, "");
  const parents = new Map<string, Set<string>>(tables.map((t) => [t, new Set()]));
  for (const r of rows) {
    const child = unquote(r.child);
    const parent = unquote(r.parent);
    if (child !== parent) parents.get(child)?.add(parent);
  }
  const ordered: string[] = [];
  const visiting = new Set<string>();
  const visit = (t: string) => {
    if (ordered.includes(t)) return;
    if (visiting.has(t)) throw new Error(`Foreign-key cycle involving "${t}"`);
    visiting.add(t);
    for (const p of parents.get(t) ?? []) visit(p);
    visiting.delete(t);
    ordered.push(t);
  };
  [...tables].sort().forEach(visit);
  return ordered;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
