import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import * as schema from "./schema";

function getDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set");
  }
  return url;
}

let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;

/**
 * Uses the Pool-based neon-serverless driver (over WebSockets) rather than neon-http,
 * because publishRace/mergeRunners need real interactive transactions (a SELECT whose
 * result gates a later INSERT/DELETE within the same atomic unit) — the HTTP driver
 * only supports batched, non-interactive transactions.
 */
export function getDb() {
  if (!_db) {
    const pool = new Pool({ connectionString: getDatabaseUrl() });
    _db = drizzle(pool, { schema });
  }
  return _db;
}
