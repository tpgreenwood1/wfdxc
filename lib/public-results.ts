import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { publishedIndividualResults, publishedTeamResults } from "@/db/schema";

/** Reads only the permanent published snapshot — never live results/runners/schools —
 * so it's unaffected by later transfers, merges, or pruning. */
export async function getPublishedRaceResults(raceId: string) {
  const db = getDb();
  const [individual, teams] = await Promise.all([
    db
      .select()
      .from(publishedIndividualResults)
      .where(eq(publishedIndividualResults.raceId, raceId))
      .orderBy(publishedIndividualResults.position),
    db
      .select()
      .from(publishedTeamResults)
      .where(eq(publishedTeamResults.raceId, raceId))
      .orderBy(publishedTeamResults.rank),
  ]);
  return { individual, teams };
}
