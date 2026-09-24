import { and, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { publishedIndividualResults, seasons } from "@/db/schema";
import { computeSeasonStandings, type SeasonStandings } from "./standings";
import type { Gender, YearGroup } from "./types";

/**
 * Reads only from `published_individual_results`, never live `results` — immune to
 * future pruning and to post-close edits that haven't been explicitly republished.
 */
export async function getSeasonStandings(
  seasonId: string,
  yearGroup: YearGroup,
  gender: Gender
): Promise<SeasonStandings> {
  const db = getDb();

  const [season] = await db
    .select({ minRacesRequired: seasons.minRacesRequired })
    .from(seasons)
    .where(eq(seasons.id, seasonId));
  if (!season) throw new Error(`Season ${seasonId} not found`);

  const rows = await db
    .select({
      runnerId: publishedIndividualResults.runnerId,
      runnerName: publishedIndividualResults.runnerName,
      position: publishedIndividualResults.position,
    })
    .from(publishedIndividualResults)
    .where(
      and(
        eq(publishedIndividualResults.seasonId, seasonId),
        eq(publishedIndividualResults.yearGroup, yearGroup),
        eq(publishedIndividualResults.gender, gender)
      )
    );

  // runnerId is a soft reference (ON DELETE SET NULL) — a pruned runner can no longer
  // accrue standings rows, so rows with a null runnerId are excluded here.
  const withRunner = rows.filter(
    (r): r is { runnerId: string; runnerName: string; position: number } =>
      r.runnerId !== null
  );

  return computeSeasonStandings(withRunner, season.minRacesRequired);
}
