import { getDb } from "@/db/client";
import { schools } from "@/db/schema";
import { findMergeCandidates } from "@/lib/runners";
import { getSchoolRoster } from "@/lib/results";
import ConfirmSubmitButton from "@/app/components/ConfirmSubmitButton";
import {
  addRunnerAction,
  dismissMergeCandidateAction,
  mergeAction,
  moveSchoolAction,
  reactivateAction,
  renameAction,
  retireAction,
} from "./actions";

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
        getSchoolRoster(schoolId, { includeRetired: true }),
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
                    <ConfirmSubmitButton
                      confirmMessage={`Merge "${c.runnerBName}" into "${c.runnerAName}"? This moves all of "${c.runnerBName}"'s results onto "${c.runnerAName}" and deletes the "${c.runnerBName}" record. This can't be undone.`}
                      className="rounded bg-gray-800 px-2 py-1 text-white"
                    >
                      Keep "{c.runnerAName}"
                    </ConfirmSubmitButton>
                  </form>
                  <form action={mergeAction}>
                    <input type="hidden" name="schoolId" value={schoolId} />
                    <input type="hidden" name="canonicalId" value={c.runnerBId} />
                    <input type="hidden" name="duplicateId" value={c.runnerAId} />
                    <ConfirmSubmitButton
                      confirmMessage={`Merge "${c.runnerAName}" into "${c.runnerBName}"? This moves all of "${c.runnerAName}"'s results onto "${c.runnerBName}" and deletes the "${c.runnerAName}" record. This can't be undone.`}
                      className="rounded bg-gray-800 px-2 py-1 text-white"
                    >
                      Keep "{c.runnerBName}"
                    </ConfirmSubmitButton>
                  </form>
                  <form action={dismissMergeCandidateAction}>
                    <input type="hidden" name="schoolId" value={schoolId} />
                    <input type="hidden" name="runnerAId" value={c.runnerAId} />
                    <input type="hidden" name="runnerBId" value={c.runnerBId} />
                    <button className="rounded bg-gray-200 px-2 py-1" type="submit">
                      Not a duplicate
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h2 className="font-semibold">Add new runner</h2>
            <p className="text-xs text-gray-500">
              Adds to the currently selected school ({allSchools.find((s) => s.id === schoolId)?.name}).
            </p>
            <form action={addRunnerAction} className="mt-1 flex items-center gap-2">
              <input type="hidden" name="schoolId" value={schoolId} />
              <input
                name="name"
                placeholder="Runner name"
                required
                className="rounded border px-2 py-1"
              />
              <button className="rounded bg-blue-600 px-3 py-1 text-white" type="submit">
                Add
              </button>
            </form>
          </section>

          <section>
            <h2 className="font-semibold">All runners</h2>
            <p className="text-xs text-gray-500">
              Retiring a runner (e.g. they've graduated) hides them from future entry
              forms and search, without touching any of their past results.
            </p>
            <ul className="mt-1 space-y-1">
              {schoolRunners.map((r) => (
                <li
                  key={r.id}
                  className={`flex flex-wrap items-center gap-2 text-sm ${
                    r.isRetired ? "opacity-50" : ""
                  }`}
                >
                  {r.duplicateCount > 1 && (
                    <span className="text-xs text-gray-500">({r.duplicateIndex})</span>
                  )}
                  {r.isRetired && (
                    <span className="rounded bg-gray-200 px-1 text-xs text-gray-600">
                      retired
                    </span>
                  )}
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
                  <form action={moveSchoolAction} className="flex items-center gap-1">
                    <input type="hidden" name="schoolId" value={schoolId} />
                    <input type="hidden" name="runnerId" value={r.id} />
                    <select
                      name="newSchoolId"
                      defaultValue={schoolId}
                      className="rounded border px-1 py-0.5 text-xs"
                    >
                      {allSchools.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                    <ConfirmSubmitButton
                      confirmMessage={`Move "${r.name}" to a different school? This only affects future rosters/entries — it won't change which school past results are credited to.`}
                      className="rounded bg-gray-200 px-2 py-0.5 text-xs"
                    >
                      Move
                    </ConfirmSubmitButton>
                  </form>
                  {r.isRetired ? (
                    <form action={reactivateAction}>
                      <input type="hidden" name="schoolId" value={schoolId} />
                      <input type="hidden" name="runnerId" value={r.id} />
                      <button className="rounded bg-gray-200 px-2 py-0.5 text-xs" type="submit">
                        Reactivate
                      </button>
                    </form>
                  ) : (
                    <form action={retireAction}>
                      <input type="hidden" name="schoolId" value={schoolId} />
                      <input type="hidden" name="runnerId" value={r.id} />
                      <ConfirmSubmitButton
                        confirmMessage={`Retire "${r.name}"? They'll be hidden from future entry forms and search, but all their past results stay exactly as they are. You can reactivate them later if needed.`}
                        className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-900"
                      >
                        Retire
                      </ConfirmSubmitButton>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </main>
  );
}
