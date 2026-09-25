"use client";

import { useState, useTransition } from "react";
import type { RosterRunner } from "@/lib/results";
import {
  addRunnersAction,
  reactivateRunnerAction,
  renameRunnerAction,
  retireRunnerAction,
} from "./actions";

function byName(a: RosterRunner, b: RosterRunner) {
  return a.name.localeCompare(b.name);
}

function RunnerName({ r }: { r: RosterRunner }) {
  return (
    <span className="min-w-0 flex-1 truncate">
      {r.name}
      {r.duplicateCount > 1 && (
        <span className="ml-1 text-xs text-gray-500">({r.duplicateIndex})</span>
      )}
    </span>
  );
}

export default function RosterManager({
  slug,
  initialRoster,
}: {
  slug: string;
  initialRoster: RosterRunner[];
}) {
  const [roster, setRoster] = useState(initialRoster);
  const [newName, setNewName] = useState("");
  const [bulkMode, setBulkMode] = useState(false);
  const [filter, setFilter] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [showRetired, setShowRetired] = useState(false);
  const [message, setMessage] = useState<{ text: string; isError: boolean } | null>(null);
  const [isPending, startTransition] = useTransition();

  const active = roster.filter((r) => !r.isRetired);
  const retired = roster.filter((r) => r.isRetired);
  const filterText = filter.trim().toLowerCase();
  const visibleActive = filterText
    ? active.filter((r) => r.name.toLowerCase().includes(filterText))
    : active;

  function fail(err: unknown, fallback: string) {
    setMessage({ text: err instanceof Error ? err.message : fallback, isError: true });
  }

  function handleAdd() {
    const names = (bulkMode ? newName.split(/\r?\n/) : [newName])
      .map((n) => n.trim())
      .filter(Boolean);
    if (names.length === 0) return;

    const existing = new Set(active.map((r) => r.name.trim().toLowerCase()));
    const clashes = names.filter((n) => existing.has(n.toLowerCase()));
    if (
      clashes.length > 0 &&
      !confirm(
        `Already on your list: ${clashes.join(", ")}. Add ${
          clashes.length === 1 ? "them" : "these"
        } again as different children anyway?`
      )
    ) {
      return;
    }

    setMessage(null);
    startTransition(async () => {
      try {
        const res = await addRunnersAction(slug, names);
        if (res.error !== undefined) throw new Error(res.error);
        const { created } = res;
        setRoster((prev) =>
          [
            ...prev,
            ...created.map((c) => ({
              id: c.id,
              name: c.name,
              duplicateIndex: 1,
              duplicateCount: 1,
              isRetired: false,
            })),
          ].sort(byName)
        );
        setNewName("");
        setMessage({
          text: `Added ${created.length === 1 ? created[0].name : `${created.length} runners`}.`,
          isError: false,
        });
      } catch (err) {
        fail(err, "Couldn't add runner.");
      }
    });
  }

  function saveRename(runner: RosterRunner, newValue: string) {
    const trimmed = newValue.trim();
    setRenamingId(null);
    if (!trimmed || trimmed === runner.name) return;
    setRoster((prev) =>
      prev.map((r) => (r.id === runner.id ? { ...r, name: trimmed } : r)).sort(byName)
    );
    startTransition(async () => {
      try {
        const res = await renameRunnerAction(slug, runner.id, trimmed);
        if (res.error) throw new Error(res.error);
      } catch (err) {
        fail(err, "Couldn't save the new spelling.");
      }
    });
  }

  function setRetired(runner: RosterRunner, isRetired: boolean) {
    if (
      isRetired &&
      !confirm(
        `Retire ${runner.name}? They'll disappear from your race entry lists, but their past results are kept. You can bring them back from "Retired" below.`
      )
    ) {
      return;
    }
    setMessage(null);
    setRoster((prev) => prev.map((r) => (r.id === runner.id ? { ...r, isRetired } : r)));
    startTransition(async () => {
      try {
        const res = isRetired
          ? await retireRunnerAction(slug, runner.id)
          : await reactivateRunnerAction(slug, runner.id);
        if (res.error !== undefined) throw new Error(res.error);
      } catch (err) {
        // Put the row back where it was so the list matches what's saved.
        setRoster((prev) =>
          prev.map((r) => (r.id === runner.id ? { ...r, isRetired: !isRetired } : r))
        );
        fail(err, "Couldn't update runner.");
      }
    });
  }

  return (
    <div className="space-y-5">
      <section className="space-y-2 rounded-lg border p-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Add runners</h2>
          <button
            type="button"
            className="min-h-[44px] text-sm text-blue-600 underline"
            onClick={() => setBulkMode((b) => !b)}
          >
            {bulkMode ? "Add one" : "Add several"}
          </button>
        </div>
        {bulkMode ? (
          <textarea
            rows={6}
            placeholder={"One name per line, e.g.\nAmelia Jones\nNoah Smith"}
            className="w-full rounded border px-3 py-2 text-base"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
        ) : (
          <input
            type="text"
            placeholder="Child's full name"
            autoComplete="off"
            className="min-h-[44px] w-full rounded border px-3 text-base"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          />
        )}
        <button
          type="button"
          className="min-h-[44px] w-full rounded-lg bg-blue-600 font-semibold text-white disabled:opacity-50"
          disabled={isPending || !newName.trim()}
          onClick={handleAdd}
        >
          {isPending ? "Saving…" : "Add"}
        </button>
      </section>

      {message && (
        <p className={`text-sm ${message.isError ? "text-red-600" : "text-green-700"}`}>
          {message.text}
        </p>
      )}

      <section className="space-y-2">
        <h2 className="font-semibold">
          Your runners <span className="font-normal text-gray-500">({active.length})</span>
        </h2>
        {active.length > 8 && (
          <input
            type="search"
            placeholder="Find a runner…"
            className="min-h-[44px] w-full rounded border px-3 text-base"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        )}
        {active.length === 0 ? (
          <p className="rounded-lg bg-gray-50 p-3 text-sm text-gray-600">
            No runners yet — add your children above so they&apos;re ready to pick on race day.
          </p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {visibleActive.map((r) => (
              <li key={r.id} className="flex min-h-[52px] items-center gap-2 px-3 py-1">
                {renamingId === r.id ? (
                  <input
                    type="text"
                    autoFocus
                    defaultValue={r.name}
                    aria-label={`New spelling for ${r.name}`}
                    className="min-h-[44px] flex-1 rounded border px-2 text-base"
                    onBlur={(e) => saveRename(r, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveRename(r, (e.target as HTMLInputElement).value);
                      if (e.key === "Escape") setRenamingId(null);
                    }}
                  />
                ) : (
                  <>
                    <RunnerName r={r} />
                    <button
                      type="button"
                      className="min-h-[44px] rounded px-2 text-sm text-blue-600"
                      onClick={() => setRenamingId(r.id)}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="min-h-[44px] rounded px-2 text-sm text-red-600"
                      onClick={() => setRetired(r, true)}
                    >
                      Retire
                    </button>
                  </>
                )}
              </li>
            ))}
            {visibleActive.length === 0 && (
              <li className="px-3 py-3 text-sm text-gray-500">No runners match “{filter}”.</li>
            )}
          </ul>
        )}
      </section>

      {retired.length > 0 && (
        <section>
          <button
            type="button"
            className="min-h-[44px] font-semibold text-gray-700"
            onClick={() => setShowRetired((s) => !s)}
            aria-expanded={showRetired}
          >
            {showRetired ? "▾" : "▸"} Retired ({retired.length})
          </button>
          {showRetired && (
            <ul className="divide-y rounded-lg border text-gray-600">
              {retired.map((r) => (
                <li key={r.id} className="flex min-h-[52px] items-center gap-2 px-3 py-1">
                  <RunnerName r={r} />
                  <button
                    type="button"
                    className="min-h-[44px] rounded px-2 text-sm text-blue-600"
                    onClick={() => setRetired(r, false)}
                  >
                    Bring back
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
