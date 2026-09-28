import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Pool } from "@neondatabase/serverless";

/**
 * Snapshots every table in the public schema to one JSON file under backups/, so the
 * whole league can be put back to exactly this state later with db:restore.
 *
 *   npm run db:backup                        backups/2026-09-27T1830Z.json
 *   npm run db:backup -- "after event 3"     backups/2026-09-27T1830Z-after-event-3.json
 *
 * All tables are read inside one REPEATABLE READ transaction, so the snapshot is
 * consistent even if a teacher is saving results while it runs. Rows are exported with
 * Postgres' own row_to_json, so dates/timestamps come out as exact text (no JS Date
 * timezone shifts) and restore feeds them straight back through json_populate_recordset.
 *
 * The file also records the column list of every table; restore refuses a backup whose
 * schema doesn't match the live DB (e.g. taken before a later migration).
 *
 * Backups contain children's names and school access codes — backups/ is gitignored;
 * keep copies somewhere private (not a public share).
 */

export type BackupFile = {
  format: "wfdxc-backup/1";
  createdAt: string;
  label: string | null;
  schema: Record<string, string[]>; // table -> ["column:type", ...]
  tables: Record<string, Record<string, unknown>[]>;
};

export async function listSchema(client: { query: Pool["query"] }) {
  const { rows } = await client.query<{ table_name: string; column_name: string; udt_name: string }>(
    `SELECT c.table_name, c.column_name, c.udt_name
       FROM information_schema.columns c
       JOIN information_schema.tables t
         ON t.table_schema = c.table_schema AND t.table_name = c.table_name
      WHERE c.table_schema = 'public' AND t.table_type = 'BASE TABLE'
      ORDER BY c.table_name, c.ordinal_position`
  );
  const schema: Record<string, string[]> = {};
  for (const r of rows) {
    (schema[r.table_name] ??= []).push(`${r.column_name}:${r.udt_name}`);
  }
  return schema;
}

export async function takeBackup(pool: Pool, label: string | null): Promise<string> {
  const client = await pool.connect();
  let backup: BackupFile;
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const schema = await listSchema(client);
    const tables: BackupFile["tables"] = {};
    for (const table of Object.keys(schema)) {
      const { rows } = await client.query<{ row: Record<string, unknown> }>(
        `SELECT row_to_json(t) AS row FROM "${table}" t`
      );
      tables[table] = rows.map((r) => r.row);
    }
    await client.query("COMMIT");
    backup = {
      format: "wfdxc-backup/1",
      createdAt: new Date().toISOString(),
      label,
      schema,
      tables,
    };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }

  const dir = join(process.cwd(), "backups");
  mkdirSync(dir, { recursive: true });
  const stamp = backup.createdAt.slice(0, 16).replace(/:/g, "") + "Z"; // 2026-09-27T1830Z
  const slug = label
    ? "-" + label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
    : "";
  const file = join(dir, `${stamp}${slug}.json`);
  writeFileSync(file, JSON.stringify(backup, null, 1));

  for (const [table, rows] of Object.entries(backup.tables)) {
    console.log(`  ${table.padEnd(30)} ${rows.length}`);
  }
  return file;
}

async function main() {
  const label = process.argv.slice(2).join(" ").trim() || null;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const pool = new Pool({ connectionString: url });
  try {
    const host = new URL(url).host;
    console.log(`Backing up ${host} ...`);
    const file = await takeBackup(pool, label);
    console.log(`\nSaved ${file}`);
  } finally {
    await pool.end();
  }
}

// Only run when invoked directly (restore-db.ts imports takeBackup).
if (process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/backup-db.ts")) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
