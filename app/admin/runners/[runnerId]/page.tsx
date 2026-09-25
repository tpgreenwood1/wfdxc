import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/db/client";
import { schools } from "@/db/schema";
import { getRunnerDetail, getRunnerHistory } from "@/lib/runners";
import { raceLabel } from "@/lib/races";
import { ordinal } from "@/lib/raceIssues";
import { formatEventDate } from "@/lib/events";
import StatusBadge from "@/app/components/StatusBadge";
import ConfirmSubmitButton from "@/app/components/ConfirmSubmitButton";
import { MergeWithPicker } from "../MergeControls";
import {
  moveRunnerAction,
  reactivateRunnerAction,
  renameRunnerAction,
  retireRunnerAction,
  setResultSchoolAction,
} from "../actions";

export const dynamic = "force-dynamic";

export default async function AdminRunnerPage({ params }: { params: { runnerId: string } }) {
  const db = getDb();
  const [runner, history, allSchools] = await Promise.all([
    getRunnerDetail(params.runnerId),
    getRunnerHistory(params.runnerId),
    db.select({ id: schools.id, name: schools.name }).from(schools).orderBy(schools.name),
  ]);
  if (!runner) notFound();

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-4 sm:p-6">
      <div>
        <Link href={`/admin/runners?school=${runner.schoolId}`} className="text-sm text-blue-600 underline">
          ← {runner.schoolName} runners
        </Link>
        <h1 className="mt-1 text-2xl font-bold">
          {runner.name}
          {runner.retiredAt && (
            <span className="ml-2 rounded bg-gray-200 px-1.5 align-middle text-sm font-normal text-gray-700">
              retired
            </span>
          )}
        </h1>
        <p className="text-gray-600">Current school: {runner.schoolName}</p>
        {runner.aliases.length > 0 && (
          <p className="text-sm text-gray-500">Also known as: {runner.aliases.join(", ")}</p>
        )}
      </div>

      <section className="space-y-3 rounded border p-3">
        <form action={renameRunnerAction} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="runnerId" value={runner.id} />
          <label className="min-w-0 flex-1 text-sm">
            Name
            <input
              name="newName"
              defaultValue={runner.name}
              required
              className="mt-1 block min-h-[44px] w-full rounded border px-2"
            />
          </label>
          <button className="min-h-[44px] rounded bg-gray-800 px-4 text-white" type="submit">
            Save name
          </button>
        </form>
        <p className="-mt-1 text-xs text-gray-500">Fixes the spelling everywhere, including finalised results.</p>

        <form action={moveRunnerAction} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="runnerId" value={runner.id} />
          <label className="min-w-0 flex-1 text-sm">
            Move to school
            <select
              name="newSchoolId"
              defaultValue={runner.schoolId}
              className="mt-1 block min-h-[44px] w-full rounded border px-2"
            >
              {allSchools.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <ConfirmSubmitButton
            confirmMessage={`Move ${runner.name} to the chosen school? They'll appear on that school's list from now on. Past results stay credited to the school they ran for — change individual races below if needed.`}
            className="min-h-[44px] rounded bg-gray-100 px-4"
          >
            Move
          </ConfirmSubmitButton>
        </form>

        <form action={runner.retiredAt ? reactivateRunnerAction : retireRunnerAction}>
          <input type="hidden" name="runnerId" value={runner.id} />
          {runner.retiredAt ? (
            <button className="min-h-[40px] rounded bg-gray-100 px-3 text-sm" type="submit">
              Bring back (un-retire)
            </button>
          ) : (
            <ConfirmSubmitButton
              confirmMessage={`Retire ${runner.name}? They're hidden from entry lists and search, but keep all their results.`}
              className="min-h-[40px] rounded bg-amber-100 px-3 text-sm text-amber-900"
            >
              Retire (left / aged out)
            </ConfirmSubmitButton>
          )}
        </form>
      </section>

      <section>
        <h2 className="font-semibold">Races ({history.length})</h2>
        <p className="text-sm text-gray-600">
          &ldquo;Ran for&rdquo; is the school credited in that race. Change it if a moved child was
          entered under the wrong school — finalised races update automatically.
        </p>
        {history.length === 0 ? (
          <p className="mt-1 text-sm text-gray-500">No results yet.</p>
        ) : (
          <ul className="mt-2 divide-y rounded border">
            {history.map((h) => (
              <li key={h.resultId} className="space-y-1 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/admin/races/${h.raceId}`} className="flex-1 font-medium text-blue-700 underline">
                    {h.eventName} — {raceLabel(h)}
                  </Link>
                  <StatusBadge status={h.raceStatus} />
                </div>
                <p className="text-sm text-gray-600">
                  {formatEventDate(h.eventDate)} · {ordinal(h.position)}
                </p>
                <form action={setResultSchoolAction} className="flex flex-wrap items-center gap-2 text-sm">
                  <input type="hidden" name="runnerId" value={runner.id} />
                  <input type="hidden" name="resultId" value={h.resultId} />
                  <input type="hidden" name="raceId" value={h.raceId} />
                  <label htmlFor={`ranfor-${h.resultId}`}>Ran for</label>
                  <select
                    id={`ranfor-${h.resultId}`}
                    name="schoolId"
                    defaultValue={h.schoolId}
                    className="min-h-[40px] rounded border px-2"
                  >
                    {allSchools.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                  <button className="min-h-[40px] rounded bg-gray-100 px-3" type="submit">
                    Save
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">Same child entered twice?</h2>
        <p className="text-sm text-gray-600">
          Find the other record (it may be at another school) and merge them into one.
        </p>
        <MergeWithPicker runner={{ id: runner.id, name: runner.name, schoolName: runner.schoolName }} />
      </section>
    </main>
  );
}
