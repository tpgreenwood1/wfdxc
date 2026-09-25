"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import type { MergeCollision, RunnerSearchResult } from "@/lib/runners";
import { raceLabel } from "@/lib/raceLabels";
import { mergeRunnersAction, type MergeResult } from "./actions";

type RunnerRef = { id: string; name: string; schoolName: string };

function useMerge() {
  const [result, setResult] = useState<MergeResult | null>(null);
  const [isPending, startTransition] = useTransition();

  function merge(keep: RunnerRef, drop: RunnerRef, redirectToCanonical: boolean) {
    const message =
      `Merge "${drop.name}" (${drop.schoolName}) into "${keep.name}" (${keep.schoolName})?\n\n` +
      `All of ${drop.name}'s results move onto ${keep.name}, "${drop.name}" is kept as an alternative spelling for search, and the duplicate record is removed. Each result keeps the school it was run for.`;
    if (!confirm(message)) return;
    setResult(null);
    const fd = new FormData();
    fd.set("canonicalId", keep.id);
    fd.set("duplicateId", drop.id);
    if (redirectToCanonical) fd.set("redirectTo", "canonical");
    startTransition(async () => {
      const res = await mergeRunnersAction(fd);
      if (res?.error) setResult(res);
    });
  }

  return { result, isPending, merge };
}

function MergeError({ result }: { result: MergeResult | null }) {
  if (!result?.error) return null;
  return (
    <div role="alert" className="mt-2 rounded bg-red-50 p-2 text-sm text-red-900">
      <p>{result.error}</p>
      {result.collisions && <CollisionLinks collisions={result.collisions} />}
    </div>
  );
}

function CollisionLinks({ collisions }: { collisions: MergeCollision[] }) {
  return (
    <ul className="mt-1 list-disc pl-5">
      {collisions.map((c) => (
        <li key={c.raceId}>
          <Link className="underline" href={`/admin/races/${c.raceId}`}>
            {c.eventName} — {raceLabel(c)}
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** "Keep A" / "Keep B" for a suggested duplicate pair. */
export function MergePairButtons({ a, b }: { a: RunnerRef; b: RunnerRef }) {
  const { result, isPending, merge } = useMerge();
  const btn = "min-h-[40px] rounded bg-gray-800 px-3 text-sm text-white disabled:opacity-50";
  return (
    <>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={btn} disabled={isPending} onClick={() => merge(a, b, false)}>
          Same child — keep &ldquo;{a.name}&rdquo;
        </button>
        <button type="button" className={btn} disabled={isPending} onClick={() => merge(b, a, false)}>
          Keep &ldquo;{b.name}&rdquo;
        </button>
      </div>
      <MergeError result={result} />
    </>
  );
}

/** On a runner's page: find any other runner (any school) and merge the two. */
export function MergeWithPicker({ runner }: { runner: RunnerRef }) {
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<RunnerSearchResult[]>([]);
  const [other, setOther] = useState<RunnerSearchResult | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { result, isPending, merge } = useMerge();

  function search(value: string) {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (value.trim().length < 2) {
      setMatches([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      const res = await fetch(`/admin/api/runners/search?q=${encodeURIComponent(value)}&includeRetired=true`);
      const data = (await res.json()) as RunnerSearchResult[];
      setMatches(data.filter((m) => m.id !== runner.id));
    }, 250);
  }

  if (other) {
    const otherRef = { id: other.id, name: other.name, schoolName: other.schoolName };
    const btn = "min-h-[44px] rounded bg-gray-800 px-3 text-sm text-white disabled:opacity-50";
    return (
      <div className="space-y-2 rounded border p-3">
        <p className="text-sm">
          Merge <strong>{runner.name}</strong> ({runner.schoolName}) with{" "}
          <strong>{other.name}</strong> ({other.schoolName}). Which record should stay?
        </p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={btn} disabled={isPending} onClick={() => merge(runner, otherRef, true)}>
            Keep &ldquo;{runner.name}&rdquo;
          </button>
          <button type="button" className={btn} disabled={isPending} onClick={() => merge(otherRef, runner, true)}>
            Keep &ldquo;{other.name}&rdquo;
          </button>
          <button type="button" className="min-h-[44px] px-3 text-sm" onClick={() => setOther(null)}>
            Cancel
          </button>
        </div>
        <p className="text-xs text-gray-500">
          The kept record keeps its current school. Use &ldquo;Move to school&rdquo; afterwards if needed.
        </p>
        <MergeError result={result} />
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <input
        type="search"
        value={query}
        onChange={(e) => search(e.target.value)}
        placeholder="Search for the other record, any school…"
        className="min-h-[44px] w-full rounded border px-2"
      />
      {matches.length > 0 && (
        <ul className="max-h-60 divide-y overflow-y-auto rounded border">
          {matches.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                className="min-h-[44px] w-full px-2 text-left text-sm hover:bg-gray-50"
                onClick={() => setOther(m)}
              >
                {m.name} <span className="text-gray-500">— {m.schoolName}</span>
                {m.isRetired && <span className="ml-1 text-amber-600">(retired)</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
