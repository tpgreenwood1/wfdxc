import Link from "next/link";
import { getDb } from "@/db/client";
import { schools } from "@/db/schema";
import { getSchoolRoster } from "@/lib/results";
import { findMergeCandidates, findTransferCandidates, searchRunners } from "@/lib/runners";
import { MergePairButtons } from "./MergeControls";
import { addRunnerAction, dismissCandidateAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function AdminRunnersPage({
  searchParams,
}: {
  searchParams: { q?: string; school?: string };
}) {
  const db = getDb();
  const q = (searchParams.q ?? "").trim();
  const allSchools = await db.select().from(schools).orderBy(schools.name);
  const school = allSchools.find((s) => s.id === searchParams.school) ?? null;

  const [matches, roster, sameSchoolCandidates, transferCandidates] = await Promise.all([
    q ? searchRunners(q, { includeRetired: true, limit: 50 }) : Promise.resolve([]),
    school && !q ? getSchoolRoster(school.id, { includeRetired: true }) : Promise.resolve([]),
    school && !q ? findMergeCandidates(school.id) : Promise.resolve([]),
    !school && !q ? findTransferCandidates() : Promise.resolve([]),
  ]);

  return (
    <main className="mx-auto max-w-3xl space-y-5 p-4 sm:p-6">
      <h1 className="text-2xl font-bold">Runners</h1>

      <form className="flex flex-wrap gap-2" action="/admin/runners">
        <input
          name="q"
          type="search"
          defaultValue={q}
          placeholder="Find a runner by name (any school)…"
          className="min-h-[44px] min-w-0 flex-1 rounded border px-2"
        />
        <button className="min-h-[44px] rounded bg-gray-800 px-4 text-white" type="submit">
          Find
        </button>
      </form>

      <nav className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-gray-600">Or browse a school:</span>
        <form action="/admin/runners" className="flex gap-2">
          <select
            name="school"
            defaultValue={school?.id ?? ""}
            className="min-h-[40px] rounded border px-2"
          >
            <option value="">Choose…</option>
            {allSchools.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <button className="min-h-[40px] rounded bg-gray-100 px-3" type="submit">
            Show
          </button>
        </form>
      </nav>

      {q && (
        <section>
          <h2 className="font-semibold">Matches for &ldquo;{q}&rdquo;</h2>
          {matches.length === 0 ? (
            <p className="text-sm text-gray-600">No runners found.</p>
          ) : (
            <ul className="mt-1 divide-y rounded border">
              {matches.map((m) => (
                <li key={m.id}>
                  <Link href={`/admin/runners/${m.id}`} className="flex min-h-[48px] items-center gap-2 px-3">
                    <span className="flex-1 font-medium">
                      {m.name}
                      {m.duplicateCount > 1 && <span className="text-gray-500"> ({m.duplicateIndex})</span>}
                    </span>
                    <span className="text-sm text-gray-600">{m.schoolName}</span>
                    {m.isRetired && <span className="text-xs text-amber-700">retired</span>}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {school && !q && (
        <>
          {sameSchoolCandidates.length > 0 && (
            <section>
              <h2 className="font-semibold">Possible duplicates at {school.name}</h2>
              <ul className="mt-1 space-y-2">
                {sameSchoolCandidates.map((c) => (
                  <li key={`${c.runnerAId}-${c.runnerBId}`} className="space-y-2 rounded border p-3 text-sm">
                    <p>
                      <Link className="underline" href={`/admin/runners/${c.runnerAId}`}>{c.runnerAName}</Link>
                      {" ↔ "}
                      <Link className="underline" href={`/admin/runners/${c.runnerBId}`}>{c.runnerBName}</Link>
                    </p>
                    <MergePairButtons
                      a={{ id: c.runnerAId, name: c.runnerAName, schoolName: school.name }}
                      b={{ id: c.runnerBId, name: c.runnerBName, schoolName: school.name }}
                    />
                    <DismissButton a={c.runnerAId} b={c.runnerBId} />
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section>
            <h2 className="font-semibold">
              {school.name} — {roster.filter((r) => !r.isRetired).length} runners
            </h2>
            <ul className="mt-1 divide-y rounded border">
              {roster.map((r) => (
                <li key={r.id}>
                  <Link
                    href={`/admin/runners/${r.id}`}
                    className={`flex min-h-[44px] items-center gap-2 px-3 ${r.isRetired ? "opacity-50" : ""}`}
                  >
                    <span className="flex-1">
                      {r.name}
                      {r.duplicateCount > 1 && <span className="text-gray-500"> ({r.duplicateIndex})</span>}
                    </span>
                    {r.isRetired && <span className="text-xs text-gray-600">retired</span>}
                    <span className="text-gray-400">›</span>
                  </Link>
                </li>
              ))}
            </ul>
            <form action={addRunnerAction} className="mt-2 flex gap-2">
              <input type="hidden" name="schoolId" value={school.id} />
              <input
                name="name"
                placeholder={`Add a runner to ${school.name}`}
                required
                className="min-h-[44px] min-w-0 flex-1 rounded border px-2"
              />
              <button className="min-h-[44px] rounded bg-blue-600 px-4 text-white" type="submit">
                Add
              </button>
            </form>
          </section>
        </>
      )}

      {!school && !q && (
        <section>
          <h2 className="font-semibold">Possible transfers</h2>
          <p className="text-sm text-gray-600">
            Very similar names at different schools that have never run in the same event —
            often a child who moved school and was added again by their new teacher.
          </p>
          {transferCandidates.length === 0 ? (
            <p className="mt-1 text-sm text-gray-500">None found.</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {transferCandidates.map((c) => (
                <li key={`${c.runnerAId}-${c.runnerBId}`} className="space-y-2 rounded border p-3 text-sm">
                  <p>
                    <Link className="underline" href={`/admin/runners/${c.runnerAId}`}>{c.runnerAName}</Link>{" "}
                    <span className="text-gray-600">({c.schoolAName})</span>
                    {" ↔ "}
                    <Link className="underline" href={`/admin/runners/${c.runnerBId}`}>{c.runnerBName}</Link>{" "}
                    <span className="text-gray-600">({c.schoolBName})</span>
                  </p>
                  <MergePairButtons
                    a={{ id: c.runnerAId, name: c.runnerAName, schoolName: c.schoolAName }}
                    b={{ id: c.runnerBId, name: c.runnerBName, schoolName: c.schoolBName }}
                  />
                  <DismissButton a={c.runnerAId} b={c.runnerBId} />
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </main>
  );
}

function DismissButton({ a, b }: { a: string; b: string }) {
  return (
    <form action={dismissCandidateAction}>
      <input type="hidden" name="runnerAId" value={a} />
      <input type="hidden" name="runnerBId" value={b} />
      <button className="min-h-[40px] rounded bg-gray-100 px-3 text-sm" type="submit">
        Different children
      </button>
    </form>
  );
}
