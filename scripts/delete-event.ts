import "dotenv/config";
import { asc, count, eq, inArray } from "drizzle-orm";
import { getDb } from "../db/client";
import { events, races, results, seasons } from "../db/schema";

/**
 * Permanently deletes an event (e.g. one created for testing) and everything hanging
 * off it. Every child table cascades from events/races, so deleting the event row
 * removes its races, results, submission + hub tokens, place acks, school statuses
 * and published individual/team rows — so it also drops out of public results and
 * season standings. Runners and schools are left alone (runners quick-added during
 * a test stay on the roster; retire or merge them from /admin/runners).
 *
 *   npm run db:delete-event                 list events with their race/result counts
 *   npm run db:delete-event -- <id>         show what would be deleted (dry run)
 *   npm run db:delete-event -- <id> --yes   actually delete it
 *
 * <id> can be the full event id or a unique prefix of it (as shown in the listing).
 */
async function main() {
  const args = process.argv.slice(2);
  const confirmed = args.includes("--yes");
  const idArg = args.find((a) => !a.startsWith("--"));

  const db = getDb();

  const allEvents = await db
    .select({
      id: events.id,
      name: events.name,
      date: events.date,
      seasonName: seasons.name,
    })
    .from(events)
    .innerJoin(seasons, eq(seasons.id, events.seasonId))
    .orderBy(asc(events.date), asc(events.name));

  if (!idArg) {
    if (allEvents.length === 0) {
      console.log("No events.");
      process.exit(0);
    }
    for (const e of allEvents) {
      const c = await countsFor(e.id);
      console.log(
        `${e.id.slice(0, 8)}  ${e.date}  ${e.name}  [${e.seasonName}]  — ${c.races} races, ${c.results} results`
      );
    }
    console.log("\nRun again with an id (or prefix) to see what would be deleted.");
    process.exit(0);
  }

  const matches = allEvents.filter((e) => e.id.startsWith(idArg.toLowerCase()));
  if (matches.length === 0) {
    console.error(`No event matches "${idArg}".`);
    process.exit(1);
  }
  if (matches.length > 1) {
    console.error(`"${idArg}" matches ${matches.length} events — use a longer prefix:`);
    for (const e of matches) console.error(`  ${e.id}  ${e.date}  ${e.name}`);
    process.exit(1);
  }

  const event = matches[0];
  const c = await countsFor(event.id);
  console.log(`Event:   ${event.name}`);
  console.log(`Date:    ${event.date}`);
  console.log(`Season:  ${event.seasonName}`);
  console.log(`Id:      ${event.id}`);
  console.log(`Races:   ${c.races} (${c.closed} closed/published)`);
  console.log(`Results: ${c.results}`);

  if (!confirmed) {
    console.log("\nDry run — nothing deleted. Add --yes to delete this event and all of the above.");
    process.exit(0);
  }

  const deleted = await db
    .delete(events)
    .where(eq(events.id, event.id))
    .returning({ id: events.id });

  if (deleted.length !== 1) {
    console.error("Event was not deleted (already gone?).");
    process.exit(1);
  }
  console.log(`\nDeleted event "${event.name}" and its ${c.races} races / ${c.results} results.`);
  process.exit(0);
}

async function countsFor(eventId: string) {
  const db = getDb();
  const raceRows = await db
    .select({ id: races.id, status: races.status })
    .from(races)
    .where(eq(races.eventId, eventId));
  const raceIds = raceRows.map((r) => r.id);
  let resultCount = 0;
  if (raceIds.length > 0) {
    const [row] = await db
      .select({ n: count() })
      .from(results)
      .where(inArray(results.raceId, raceIds));
    resultCount = row.n;
  }
  return {
    races: raceRows.length,
    closed: raceRows.filter((r) => r.status === "closed").length,
    results: resultCount,
  };
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
