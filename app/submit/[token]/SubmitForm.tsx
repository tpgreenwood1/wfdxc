"use client";

import { useRef, useState, useTransition } from "react";
import type { RosterRunner, SubmittedResult } from "@/lib/results";
import type { RunnerSearchResult } from "@/lib/runners";
import { removeResult, renameRunnerAction, submitResults, type SubmitRow } from "./actions";

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
  const [renamingKey, setRenamingKey] = useState<string | null>(null);

  const rosterIds = new Set(roster.map((r) => r.id));

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

  function saveRename(row: Row, newName: string) {
    if (!row.runnerId || !newName.trim()) {
      setRenamingKey(null);
      return;
    }
    updateRow(row.key, { runnerName: newName.trim() });
    setRenamingKey(null);
    startTransition(async () => {
      try {
        await renameRunnerAction(token, row.runnerId!, newName.trim());
      } catch (err) {
        setMessage(err instanceof Error ? err.message : "Rename failed.");
      }
    });
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
      {isEditable && (
        <div className="sticky top-0 z-10 -mx-4 flex items-center gap-3 border-b bg-white/95 px-4 py-2 backdrop-blur">
          <button
            type="button"
            className="rounded bg-blue-600 px-4 py-2 font-medium text-white disabled:opacity-50"
            disabled={isPending}
            onClick={handleSubmit}
          >
            {isPending ? "Saving…" : "Save results"}
          </button>
          {message && <p className="text-sm text-gray-700">{message}</p>}
        </div>
      )}

      <ul className="space-y-2">
        {rows.map((row) => {
          const canRename = isEditable && row.runnerId && rosterIds.has(row.runnerId);
          const isRenaming = renamingKey === row.key;
          return (
            <li key={row.key} className="flex items-center gap-2 rounded border p-2">
              {isRenaming ? (
                <input
                  type="text"
                  autoFocus
                  defaultValue={row.runnerName}
                  className="flex-1 rounded border px-1"
                  onBlur={(e) => saveRename(row, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveRename(row, (e.target as HTMLInputElement).value);
                    if (e.key === "Escape") setRenamingKey(null);
                  }}
                />
              ) : (
                <span className="flex-1 truncate">
                  {row.runnerName || row.newRunnerName}
                  {row.newRunnerName && (
                    <span className="ml-1 text-xs text-gray-500">(new)</span>
                  )}
                  {canRename && (
                    <button
                      type="button"
                      className="ml-2 text-xs text-blue-600 underline"
                      onClick={() => setRenamingKey(row.key)}
                      title="Fix a misspelled name"
                    >
                      rename
                    </button>
                  )}
                </span>
              )}
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
          );
        })}
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
    </div>
  );
}

const SEARCH_DEBOUNCE_MS = 300;

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
  const [hasSearched, setHasSearched] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const usedRunnerIds = new Set(existing.map((r) => r.runnerId));
  const rosterSuggestions = roster.filter((r) => !usedRunnerIds.has(r.id));

  function handleQueryChange(value: string) {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (value.trim().length < 2) {
      setMatches([]);
      setHasSearched(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await fetch(`/api/runners/search?q=${encodeURIComponent(value)}`);
        const data = (await res.json()) as RunnerSearchResult[];
        setMatches(data);
        setHasSearched(true);
      } finally {
        setIsSearching(false);
      }
    }, SEARCH_DEBOUNCE_MS);
  }

  function pick(match: RunnerSearchResult) {
    if (existing.some((r) => r.runnerId === match.id)) return;
    const suffix = match.duplicateCount > 1 ? ` (${match.duplicateIndex})` : "";
    onPick(match.id, `${match.name}${suffix} — ${match.schoolName}`);
    setQuery("");
    setMatches([]);
    setHasSearched(false);
  }

  function quickAdd() {
    const name = query.trim();
    if (!name) return;
    const exactRosterMatch = roster.find(
      (r) => r.name.trim().toLowerCase() === name.toLowerCase()
    );
    if (exactRosterMatch) {
      const proceed = confirm(
        `There's already a "${exactRosterMatch.name}" on your roster. Add "${name}" as a new, different runner anyway?`
      );
      if (!proceed) return;
    }
    onPick(null, "", name);
    setQuery("");
    setMatches([]);
    setHasSearched(false);
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
                onClick={() =>
                  onPick(
                    r.id,
                    r.duplicateCount > 1 ? `${r.name} (${r.duplicateIndex})` : r.name
                  )
                }
              >
                {r.name}
                {r.duplicateCount > 1 && (
                  <span className="ml-1 text-xs text-gray-500">({r.duplicateIndex})</span>
                )}
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
                {m.name}
                {m.duplicateCount > 1 && (
                  <span className="text-xs text-gray-500"> ({m.duplicateIndex})</span>
                )}
                {" — "}
                {m.schoolName}
              </button>
            </li>
          ))}
        </ul>
      )}
      {!isSearching && hasSearched && matches.length === 0 && query.trim().length >= 2 && (
        <p className="mt-1 text-xs text-gray-500">No matches found.</p>
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
