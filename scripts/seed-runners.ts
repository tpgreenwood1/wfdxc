import "dotenv/config";
import { readFileSync } from "fs";
import { and, eq, ilike } from "drizzle-orm";
import { getDb } from "../db/client";
import { runners, schools } from "../db/schema";

/**
 * Seeds runners (and their schools) from a plain text file, one runner per line,
 * columns separated by a tab or a comma:
 *   Name<TAB>School
 * A header row (first column "Name") is skipped automatically. Blank lines and
 * lines starting with # are ignored. Safe to re-run: schools are matched
 * case-insensitively by name, and a runner already on file at that school
 * (case-insensitive name match) is skipped rather than duplicated.
 */
async function main() {
  const filePath = process.argv[2] ?? "dbNameSeed.txt";
  const raw = readFileSync(filePath, "utf-8");
  const lines = raw.split(/\r?\n/);

  const db = getDb();
  const schoolIdByName = new Map<string, string>();
  let schoolsCreated = 0;
  let runnersCreated = 0;
  let runnersSkipped = 0;
  let linesSkipped = 0;

  for (const [i, rawLine] of lines.entries()) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const sepIndex = line.includes("\t") ? line.indexOf("\t") : line.indexOf(",");
    if (sepIndex === -1) {
      console.warn(
        `Line ${i + 1}: missing school (expected "Name<TAB>School" or "Name, School") — skipping: "${line}"`
      );
      linesSkipped++;
      continue;
    }

    const name = line.slice(0, sepIndex).trim();
    const schoolName = line.slice(sepIndex + 1).trim();
    if (!name || !schoolName) {
      console.warn(`Line ${i + 1}: empty name or school — skipping: "${line}"`);
      linesSkipped++;
      continue;
    }
    if (name.toLowerCase() === "name" && schoolName.toLowerCase() === "school") {
      continue; // header row
    }

    const schoolKey = schoolName.toLowerCase();
    let schoolId = schoolIdByName.get(schoolKey);
    if (!schoolId) {
      const [existingSchool] = await db
        .select({ id: schools.id })
        .from(schools)
        .where(ilike(schools.name, schoolName));

      if (existingSchool) {
        schoolId = existingSchool.id;
      } else {
        const [created] = await db
          .insert(schools)
          .values({ name: schoolName })
          .returning({ id: schools.id });
        schoolId = created.id;
        schoolsCreated++;
      }
      schoolIdByName.set(schoolKey, schoolId);
    }

    const [existingRunner] = await db
      .select({ id: runners.id })
      .from(runners)
      .where(and(eq(runners.schoolId, schoolId), ilike(runners.name, name)));

    if (existingRunner) {
      runnersSkipped++;
      continue;
    }

    await db.insert(runners).values({ schoolId, name });
    runnersCreated++;
  }

  console.log(`Schools created: ${schoolsCreated}`);
  console.log(`Runners created: ${runnersCreated}`);
  console.log(`Runners skipped (already existed): ${runnersSkipped}`);
  console.log(`Lines skipped (malformed): ${linesSkipped}`);

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
