"use client";

import { useState, useTransition } from "react";
import type { RosterRunner, SubmittedResult } from "@/lib/results";
import type { RunnerSearchResult } from "@/lib/runners";
import { removeResult, submitResults, type SubmitRow } from "./actions";

type Row = {
  key: string;
  resultId?: string;
  runnerId: string | null;
  runnerName: string;
  newRunnerName?: string;
  position: string;
};

function existingToRows(existing: SubmittedResult[]): Row[] {
  return existing.map((r) => ({
    key: r.id,
    resultId: r.id,
    runnerId: r.runnerId,
    runnerName: r.runnerName,
    position: String(r.position),
  }));
}

export default function SubmitForm({
  token,
  isEditable,
  initialResults,
  roster,
}: {
  token: string;
  isEditable: boolean;
  initialResults: SubmittedResult[];
  roster: RosterRunner[];
}) {
  const [rows, setRows] = useState<Row[]>(() => existingToRows(initialResults));
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function addRow(runnerId: string | null, runnerName: string, newRunnerName?: string) {
    setRows((prev) => [
      ...prev,
      {
        key: `new-${Date.now()}-${Math.random()}`,
        runnerId,
        runnerName,
        newRunnerName,
        position: "",
      },
    ]);
  }

  function updateRow(key: string, updates: Partial<Row>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...updates } : r)));
  }

  function removeRow(row: Row) {
    setRows((prev) => prev.filter((r) => r.key !== row.key));
    if (row.resultId) {
      startTransition(async () => {
        await removeResult(token, row.resultId!);
      });
    }
  }

  function handleSubmit() {
    setMessage(null);
    const payload: SubmitRow[] = rows
      .filter((r) => r.position.trim() !== "")
      .map((r) => ({
        runnerId: r.runnerId,
        newRunnerName: r.newRunnerName,
        position: Number(r.position),
      }));

    startTransition(async () => {
      try {
        await submitResults(token, payload);
        setMessage("Saved.");
      } catch (err) {
        setMessage(err instanceof Error ? err.message : "Something went wrong.");
      }
    });
  }

  return (
    <div className="mt-4 space-y-4">
      <ul className="space-y-2">
        {rows.map((row) => (
          <li key={row.key} className="flex items-center gap-2 rounded border p-2">
            <span className="flex-1 truncate">
              {row.runnerName || row.newRunnerName}
              {row.newRunnerName && (
                <span className="ml-1 text-xs text-gray-500">(new)</span>
              )}
            </span>
            <input
              type="number"
              inputMode="numeric"
              className="w-16 rounded border px-2 py-1"
              placeholder="pos"
              value={row.position}
              disabled={!isEditable}
              onChange={(e) => updateRow(row.key, { position: e.target.value })}
            />
            {isEditable && (
              <button
                type="button"
                className="text-sm text-red-600"
                onClick={() => removeRow(row)}
              >
                remove
              </button>
            )}
          </li>
        ))}
      </ul>

      {isEditable && <RunnerPicker onPick={addRow} existing={rows} roster={roster} />}

      {isEditable && (
        <button
          type="button"
          className="w-full rounded bg-blue-600 py-2 text-white disabled:opacity-50"
          disabled={isPending}
          onClick={handleSubmit}
        >
          {isPending ? "Saving…" : "Save results"}
        </button>
      )}

      {message && <p className="text-sm text-gray-700">{message}</p>}
    </div>
  );
}

function RunnerPicker({
  onPick,
  existing,
  roster,
}: {
  onPick: (runnerId: string | null, runnerName: string, newRunnerName?: string) => void;
  existing: Row[];
  roster: RosterRunner[];
}) {
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<RunnerSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const usedRunnerIds = new Set(existing.map((r) => r.runnerId));
  const rosterSuggestions = roster.filter((r) => !usedRunnerIds.has(r.id));

  async function handleQueryChange(value: string) {
    setQuery(value);
    if (value.trim().length < 2) {
      setMatches([]);
      return;
    }
    setIsSearching(true);
    try {
      const res = await fetch(`/api/runners/search?q=${encodeURIComponent(value)}`);
      const data = (await res.json()) as RunnerSearchResult[];
      setMatches(data);
    } finally {
      setIsSearching(false);
    }
  }

  function pick(match: RunnerSearchResult) {
    if (existing.some((r) => r.runnerId === match.id)) return;
    onPick(match.id, `${match.name} (${match.schoolName})`);
    setQuery("");
    setMatches([]);
  }

  function quickAdd() {
    if (!query.trim()) return;
    onPick(null, "", query.trim());
    setQuery("");
    setMatches([]);
  }

  return (
    <div className="rounded border p-2">
      <input
        type="text"
        className="w-full rounded border px-2 py-1"
        placeholder="Search runner by name…"
        value={query}
        onChange={(e) => handleQueryChange(e.target.value)}
      />
      {isSearching && <p className="text-xs text-gray-500">Searching…</p>}
      {query.trim() === "" && rosterSuggestions.length > 0 && (
        <ul className="mt-1 divide-y">
          {rosterSuggestions.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                className="w-full py-1 text-left text-sm hover:bg-gray-50"
                onClick={() => onPick(r.id, r.name)}
              >
                {r.name}
              </button>
            </li>
          ))}
        </ul>
      )}
      {query.trim() !== "" && matches.length > 0 && (
        <ul className="mt-1 divide-y">
          {matches.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                className="w-full py-1 text-left text-sm hover:bg-gray-50"
                onClick={() => pick(m)}
              >
                {m.name} — {m.schoolName}
              </button>
            </li>
          ))}
        </ul>
      )}
      {query.trim().length >= 2 && (
        <button
          type="button"
          className="mt-1 w-full text-left text-sm text-blue-600"
          onClick={quickAdd}
        >
          + Add new runner "{query.trim()}"
        </button>
      )}
    </div>
  );
}
