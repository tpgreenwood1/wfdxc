import Link from "next/link";
import type { DoubleEntry } from "@/lib/eventBoard";
import { ordinal } from "@/lib/raceIssues";

/** Runners entered in two races of one event — usually results typed into the wrong
 * race. Each race links to its page, where the scorer can delete the wrong result or
 * move the school's entries across. */
export default function DoubleEntriesList({ entries }: { entries: DoubleEntry[] }) {
  if (entries.length === 0) return null;
  return (
    <section>
      <h2 className="font-semibold">Entered in more than one race</h2>
      <p className="text-sm text-gray-600">
        Usually results typed into the wrong race. Open the wrong race and delete the result, or
        use &ldquo;Move entries&rdquo; there to move that school&apos;s runners across.
      </p>
      <ul className="mt-1 divide-y rounded border border-amber-300">
        {entries.map((e) => (
          <li key={e.runnerId} className="p-3 text-sm">
            <Link href={`/admin/runners/${e.runnerId}`} className="font-medium underline">
              {e.runnerName}
            </Link>
            <span className="text-gray-700">
              {" — "}
              {e.races.map((r, i) => (
                <span key={r.raceId}>
                  {i > 0 && ", "}
                  <Link className="text-blue-700 underline" href={`/admin/races/${r.raceId}`}>
                    {r.label}
                  </Link>{" "}
                  ({ordinal(r.position)}, {r.schoolName})
                </span>
              ))}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
