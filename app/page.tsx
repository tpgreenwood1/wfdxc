import Link from "next/link";
import { cookies } from "next/headers";
import { getDb } from "@/db/client";
import { schools } from "@/db/schema";
import { LAST_SCHOOL_COOKIE } from "@/lib/schoolAccess";
import HelpButton from "./components/HelpButton";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const db = getDb();
  const allSchools = await db
    .select({ name: schools.name, slug: schools.slug })
    .from(schools)
    .orderBy(schools.name);
  const lastSlug = cookies().get(LAST_SCHOOL_COOKIE)?.value;
  const lastSchool = allSchools.find((s) => s.slug === lastSlug);

  return (
    <main className="mx-auto max-w-md space-y-8 p-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Junior XC League</h1>
        <HelpButton topics={["home", "scoring"]} />
      </div>

      {lastSchool && (
        <Link
          href={`/school/${lastSchool.slug}`}
          className="flex min-h-[56px] items-center justify-between rounded-lg bg-blue-600 px-4 font-semibold text-white"
        >
          <span>Continue to {lastSchool.name}</span>
          <span aria-hidden>→</span>
        </Link>
      )}

      <section className="grid grid-cols-2 gap-2">
        <Link
          href="/results"
          className="flex min-h-[48px] items-center justify-center rounded-lg border text-blue-700"
        >
          Race results
        </Link>
        <Link
          href="/standings"
          className="flex min-h-[48px] items-center justify-center rounded-lg border text-blue-700"
        >
          Season standings
        </Link>
      </section>

      <section>
        <h2 className="font-semibold">Teachers — find your school</h2>
        <p className="text-sm text-gray-600">
          Enter results, manage your runners and see how your school did.
        </p>
        {allSchools.length === 0 ? (
          <p className="mt-2 text-sm text-gray-500">No schools set up yet.</p>
        ) : (
          <ul className="mt-2 divide-y rounded-lg border">
            {allSchools.map((s) => (
              <li key={s.slug}>
                <Link
                  href={`/school/${s.slug}`}
                  className="flex min-h-[48px] items-center justify-between px-3"
                >
                  <span>{s.name}</span>
                  <span aria-hidden className="text-gray-400">
                    →
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="text-center text-sm">
        <Link className="text-gray-500 underline" href="/admin" prefetch={false}>
          Scorer admin
        </Link>
      </p>
    </main>
  );
}
