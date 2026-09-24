import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { runners, schools } from "@/db/schema";
import { findMergeCandidates } from "@/lib/runners";
import { mergeAction, renameAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function RosterPage({
  searchParams,
}: {
  searchParams: { schoolId?: string };
}) {
  const db = getDb();
  const allSchools = await db.select().from(schools).orderBy(schools.name);
  const schoolId = searchParams.schoolId ?? allSchools[0]?.id;

  const [schoolRunners, candidates] = schoolId
    ? await Promise.all([
        db.select().from(runners).where(eq(runners.schoolId, schoolId)),
        findMergeCandidates(schoolId),
      ])
    : [[], []];

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-6">
      <h1 className="text-2xl font-bold">Roster / merge tool</h1>

      <nav className="flex flex-wrap gap-2 text-sm">
        {allSchools.map((s) => (
          <a
            key={s.id}
            href={`/admin/roster?schoolId=${s.id}`}
            className={
              s.id === schoolId ? "font-semibold underline" : "text-blue-600 underline"
            }
          >
            {s.name}
          </a>
        ))}
      </nav>

      {schoolId && (
        <>
          <section>
            <h2 className="font-semibold">Possible duplicates</h2>
            {candidates.length === 0 && (
              <p className="text-sm text-gray-600">None found.</p>
            )}
            <ul className="mt-1 space-y-2">
              {candidates.map((c) => (
                <li
                  key={`${c.runnerAId}-${c.runnerBId}`}
                  className="flex items-center gap-2 rounded border p-2 text-sm"
                >
                  <span className="flex-1">
                    "{c.runnerAName}" ↔ "{c.runnerBName}" (similarity{" "}
                    {c.similarity.toFixed(2)})
                  </span>
                  <form action={mergeAction}>
                    <input type="hidden" name="schoolId" value={schoolId} />
                    <input type="hidden" name="canonicalId" value={c.runnerAId} />
                    <input type="hidden" name="duplicateId" value={c.runnerBId} />
                    <button className="rounded bg-gray-800 px-2 py-1 text-white" type="submit">
                      Keep "{c.runnerAName}"
                    </button>
                  </form>
                  <form action={mergeAction}>
                    <input type="hidden" name="schoolId" value={schoolId} />
                    <input type="hidden" name="canonicalId" value={c.runnerBId} />
                    <input type="hidden" name="duplicateId" value={c.runnerAId} />
                    <button className="rounded bg-gray-800 px-2 py-1 text-white" type="submit">
                      Keep "{c.runnerBName}"
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h2 className="font-semibold">All runners</h2>
            <ul className="mt-1 space-y-1">
              {schoolRunners.map((r) => (
                <li key={r.id} className="flex items-center gap-2 text-sm">
                  <form action={renameAction} className="flex items-center gap-2">
                    <input type="hidden" name="schoolId" value={schoolId} />
                    <input type="hidden" name="runnerId" value={r.id} />
                    <input
                      name="newName"
                      defaultValue={r.name}
                      className="rounded border px-2 py-0.5"
                    />
                    <button className="rounded bg-gray-200 px-2 py-0.5" type="submit">
                      Rename
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </main>
  );
}
