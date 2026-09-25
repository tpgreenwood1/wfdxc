// Pure — safe for client and server.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Every id and token in the database is a Postgres uuid, and querying one with any
 * other string throws ("invalid input syntax for type uuid") — a 500 instead of a
 * "not found". Check URL params with this first, e.g. a link truncated when pasted. */
export function isUuid(value: string | null | undefined): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}
