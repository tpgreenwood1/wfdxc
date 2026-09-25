import Link from "next/link";
import { isNull, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { runners, schools } from "@/db/schema";
import { teacherLinkMessage, teacherLinkPath } from "@/lib/schools";
import CopyLinkButton from "@/app/components/CopyLinkButton";
import ShareLinkButton from "@/app/components/ShareLinkButton";
import ConfirmSubmitButton from "@/app/components/ConfirmSubmitButton";
import ConfirmDeleteButton from "../ConfirmDeleteButton";
import FilterableList from "../FilterableList";
import {
  createSchoolAction,
  deleteSchoolAction,
  regenerateSchoolCodeAction,
  renameSchoolAction,
} from "../actions";

export const dynamic = "force-dynamic";

export default async function AdminSchoolsPage() {
  const db = getDb();
  const [allSchools, runnerCounts] = await Promise.all([
    db.select().from(schools).orderBy(schools.name),
    db
      .select({ schoolId: runners.schoolId, count: sql<number>`count(*)::int` })
      .from(runners)
      .where(isNull(runners.retiredAt))
      .groupBy(runners.schoolId),
  ]);
  const countBySchool = new Map(runnerCounts.map((r) => [r.schoolId, r.count]));

  return (
    <main className="mx-auto max-w-3xl space-y-4 p-4 sm:p-6">
      <h1 className="text-2xl font-bold">Schools</h1>
      <p className="text-sm text-gray-600">
        Each school has one <strong>teacher link</strong> for the whole season. It opens their
        school page and remembers the phone. If a teacher has lost it, tap <strong>Share</strong>{" "}
        to send the link and code by text, WhatsApp or email.
      </p>

      <FilterableList
        placeholder="Search schools…"
        items={allSchools.map((s) => ({
          key: s.id,
          text: `${s.name} ${s.accessCode}`,
          node: (
            <div className="space-y-2 p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-lg font-medium">{s.name}</span>
                <span className="font-mono text-xl tracking-widest" title="Access code">
                  {s.accessCode}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <ShareLinkButton
                  path={teacherLinkPath(s)}
                  title={`${s.name} cross-country`}
                  message={teacherLinkMessage(s)}
                  label="Share link"
                />
                <CopyLinkButton path={teacherLinkPath(s)} label="Copy link" />
                <Link
                  className="text-sm text-blue-600 underline"
                  href={`/admin/runners?school=${s.id}`}
                >
                  {countBySchool.get(s.id) ?? 0} runners
                </Link>
              </div>
              <details className="text-sm">
                <summary className="cursor-pointer text-gray-600">More…</summary>
                <div className="mt-2 flex flex-wrap items-start gap-3">
                  <form action={renameSchoolAction} className="flex gap-2">
                    <input type="hidden" name="schoolId" value={s.id} />
                    <input
                      name="name"
                      defaultValue={s.name}
                      required
                      className="min-h-[40px] rounded border px-2"
                    />
                    <button className="min-h-[40px] rounded bg-gray-100 px-3" type="submit">
                      Rename
                    </button>
                  </form>
                  <form action={regenerateSchoolCodeAction}>
                    <input type="hidden" name="schoolId" value={s.id} />
                    <ConfirmSubmitButton
                      className="min-h-[40px] rounded bg-gray-100 px-3"
                      confirmMessage={`Give ${s.name} a new code? Every phone using the current link or code will need the new one.`}
                    >
                      New code
                    </ConfirmSubmitButton>
                  </form>
                  <ConfirmDeleteButton
                    action={deleteSchoolAction}
                    fieldName="schoolId"
                    fieldValue={s.id}
                    confirmMessage={`Delete "${s.name}"? Only possible if it has no runners or results.`}
                  />
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  Renaming keeps the same link. A new code logs out every phone using the old one.
                </p>
              </details>
            </div>
          ),
        }))}
      />

      <form action={createSchoolAction} className="flex gap-2">
        <input
          name="name"
          placeholder="New school name"
          className="min-h-[44px] flex-1 rounded border px-2"
          required
        />
        <button className="min-h-[44px] rounded bg-gray-800 px-4 text-white" type="submit">
          Add school
        </button>
      </form>
    </main>
  );
}
