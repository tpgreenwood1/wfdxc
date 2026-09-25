"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import type { AdminResultRow } from "@/lib/results";
import type { RunnerSearchResult } from "@/lib/runners";
import {
  addResultAction,
  createRunnerAction,
  deleteResultAction,
  updateResultAction,
} from "./actions";

type DisplayItem =
  | { kind: "result"; row: AdminResultRow }
  | { kind: "gap"; position: number };

type SchoolOption = { id: string; name: string };

export default function RaceResultsTable({
  raceId,
  initialRows,
  allSchools,
}: {
  raceId: string;
  initialRows: AdminResultRow[];
  allSchools: SchoolOption[];
}) {
  const [rows, setRows] = useState(initialRows);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingRunnerId, setEditingRunnerId] = useState<string | null>(null);
  const [editingGapPosition, setEditingGapPosition] = useState<number | null>(null);
  const [isAddingResult, setIsAddingResult] = useState(false);
  const [newResultPosition, setNewResultPosition] = useState(1);
  const [showGaps, setShowGaps] = useState(true);
  const [filter, setFilter] = useState("");
  const [isPending, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) => r.runnerName.toLowerCase().includes(q) || r.schoolName.toLowerCase().includes(q)
    );
  }, [rows, filter]);

  const sorted = useMemo(
    () => [...filtered].sort((a, b) => a.position - b.position),
    [filtered]
  );

  const maxPosition = useMemo(
    () => rows.reduce((max, r) => Math.max(max, r.position), 0),
    [rows]
  );

  const positionCounts = useMemo(() => {
    const counts = new Map<number, number>();
    for (const r of rows) counts.set(r.position, (counts.get(r.position) ?? 0) + 1);
    return counts;
  }, [rows]);

  // Gap placeholders only make sense against the full, unfiltered field — a text
  // filter narrows `sorted` to a subset whose positions aren't actually contiguous.
  const display = useMemo<DisplayItem[]>(() => {
    if (!showGaps || filter.trim() !== "") {
      return sorted.map((row) => ({ kind: "result", row }));
    }
    const items: DisplayItem[] = [];
    let previousPosition: number | null = null;
    for (const row of sorted) {
      if (previousPosition !== null) {
        for (let p = previousPosition + 1; p < row.position; p++) {
          items.push({ kind: "gap", position: p });
        }
      }
      items.push({ kind: "result", row });
      previousPosition = row.position;
    }
    return items;
  }, [sorted, showGaps, filter]);

  function savePosition(row: AdminResultRow, newPosition: number) {
    setRows((prev) =>
      prev.map((r) => (r.id === row.id ? { ...r, position: newPosition } : r))
    );
    setEditingId(null);
    startTransition(async () => {
      const formData = new FormData();
      formData.set("raceId", raceId);
      formData.set("resultId", row.id);
      formData.set("position", String(newPosition));
      await updateResultAction(formData);
    });
  }

  function saveRunner(row: AdminResultRow, match: RunnerSearchResult) {
    setRows((prev) =>
      prev.map((r) =>
        r.id === row.id
          ? {
              ...r,
              runnerId: match.id,
              runnerName: match.name,
              schoolId: match.schoolId,
              schoolName: match.schoolName,
            }
          : r
      )
    );
    setEditingRunnerId(null);
    startTransition(async () => {
      const formData = new FormData();
      formData.set("raceId", raceId);
      formData.set("resultId", row.id);
      formData.set("runnerId", match.id);
      formData.set("schoolId", match.schoolId);
      await updateResultAction(formData);
    });
  }

  function addResultAt(position: number, match: RunnerSearchResult) {
    setEditingGapPosition(null);
    setIsAddingResult(false);
    startTransition(async () => {
      const formData = new FormData();
      formData.set("raceId", raceId);
      formData.set("runnerId", match.id);
      formData.set("schoolId", match.schoolId);
      formData.set("position", String(position));
      const { id } = await addResultAction(formData);
      setRows((prev) => [
        ...prev,
        {
          id,
          runnerId: match.id,
          runnerName: match.name,
          schoolId: match.schoolId,
          schoolName: match.schoolName,
          position,
        },
      ]);
    });
  }

  function removeRow(row: AdminResultRow) {
    if (!confirm(`Delete ${row.runnerName}'s result (position ${row.position})?`)) return;
    setRows((prev) => prev.filter((r) => r.id !== row.id));
    startTransition(async () => {
      const formData = new FormData();
      formData.set("raceId", raceId);
      formData.set("resultId", row.id);
      await deleteResultAction(formData);
    });
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-1 text-sm text-gray-600">
          <input
            type="checkbox"
            checked={showGaps}
            onChange={(e) => setShowGaps(e.target.checked)}
          />
          Show gaps in race order
        </label>
        <input
          type="text"
          placeholder="Filter by runner or school…"
          className="rounded border px-2 py-1 text-sm"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        {!isAddingResult && (
          <button
            type="button"
            className="rounded bg-blue-600 px-2 py-1 text-sm text-white"
            onClick={() => {
              setNewResultPosition(maxPosition + 1);
              setIsAddingResult(true);
            }}
          >
            + Add result
          </button>
        )}
      </div>

      {isAddingResult && (
        <div className="mt-2 flex items-center gap-2 rounded border bg-blue-50 p-2">
          <label className="text-sm text-gray-600">Position</label>
          <input
            type="number"
            autoFocus
            value={newResultPosition}
            onChange={(e) => setNewResultPosition(Number(e.target.value))}
            className="w-16 rounded border px-1 py-0.5"
          />
          <RunnerPicker
            raceId={raceId}
            allSchools={allSchools}
            onPick={(match) => addResultAt(newResultPosition, match)}
            onCancel={() => setIsAddingResult(false)}
          />
        </div>
      )}

      <table className="mt-2 w-full text-sm">
        <thead>
          <tr className="text-left">
            <th className="py-1">Pos</th>
            <th className="py-1">Runner</th>
            <th className="py-1">School</th>
            <th className="py-1" />
          </tr>
        </thead>
        <tbody>
          {display.map((item) => {
            if (item.kind === "gap") {
              return (
                <tr key={`gap-${item.position}`} className="bg-amber-50">
                  <td className="py-1 text-gray-400">{item.position}</td>
                  <td className="py-1 text-gray-400" colSpan={3}>
                    {editingGapPosition === item.position ? (
                      <RunnerPicker
                        raceId={raceId}
                        allSchools={allSchools}
                        onPick={(match) => addResultAt(item.position, match)}
                        onCancel={() => setEditingGapPosition(null)}
                      />
                    ) : (
                      <button
                        type="button"
                        className="italic underline"
                        onClick={() => setEditingGapPosition(item.position)}
                        title="Add a runner at this position"
                      >
                        — missing, click to add runner —
                      </button>
                    )}
                  </td>
                </tr>
              );
            }

            const row = item.row;
            const isDuplicate = (positionCounts.get(row.position) ?? 0) > 1;

            return (
              <tr key={row.id} className={isDuplicate ? "bg-red-100" : undefined}>
                <td className="py-1">
                  {editingId === row.id ? (
                    <input
                      type="number"
                      autoFocus
                      defaultValue={row.position}
                      className="w-16 rounded border px-1"
                      onBlur={(e) => savePosition(row, Number(e.target.value))}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          savePosition(row, Number((e.target as HTMLInputElement).value));
                        }
                      }}
                    />
                  ) : (
                    <button
                      type="button"
                      className="underline"
                      onClick={() => setEditingId(row.id)}
                      title="Click to edit"
                    >
                      {row.position}
                    </button>
                  )}
                </td>
                <td className="py-1">
                  {editingRunnerId === row.id ? (
                    <RunnerPicker
                      raceId={raceId}
                      allSchools={allSchools}
                      onPick={(match) => saveRunner(row, match)}
                      onCancel={() => setEditingRunnerId(null)}
                    />
                  ) : (
                    <button
                      type="button"
                      className="underline"
                      onClick={() => setEditingRunnerId(row.id)}
                      title="Click to reassign to a different runner"
                    >
                      {row.runnerName}
                    </button>
                  )}
                </td>
                <td className="py-1">{row.schoolName}</td>
                <td className="py-1">
                  <button
                    type="button"
                    className="text-xs text-red-600"
                    onClick={() => removeRow(row)}
                  >
                    delete
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {sorted.length === 0 && (
        <p className="mt-2 text-sm text-gray-500">No results match "{filter}".</p>
      )}
      {isPending && <p className="mt-1 text-xs text-gray-500">Saving…</p>}
    </div>
  );
}

const SEARCH_DEBOUNCE_MS = 300;

function RunnerPicker({
  raceId,
  allSchools,
  onPick,
  onCancel,
}: {
  raceId: string;
  allSchools: SchoolOption[];
  onPick: (match: RunnerSearchResult) => void;
  onCancel: () => void;
}) {
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<RunnerSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newSchoolId, setNewSchoolId] = useState(allSchools[0]?.id ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleQueryChange(value: string) {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (value.trim().length < 2) {
      setMatches([]);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await fetch(
          `/api/runners/search?q=${encodeURIComponent(value)}&includeRetired=true`
        );
        const data = (await res.json()) as RunnerSearchResult[];
        setMatches(data);
      } finally {
        setIsSearching(false);
      }
    }, SEARCH_DEBOUNCE_MS);
  }

  async function handleCreate() {
    const name = newName.trim();
    if (!name || !newSchoolId) return;
    setError(null);
    setIsSaving(true);
    try {
      const formData = new FormData();
      formData.set("raceId", raceId);
      formData.set("name", name);
      formData.set("schoolId", newSchoolId);
      const runner = await createRunnerAction(formData);
      onPick({ ...runner, duplicateIndex: 1, duplicateCount: 1, isRetired: false });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't add runner.");
    } finally {
      setIsSaving(false);
    }
  }

  if (isCreating) {
    return (
      <div className="w-64 rounded border bg-white p-2 shadow">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-gray-600">New runner</span>
          <button type="button" className="text-xs text-gray-500" onClick={onCancel}>
            ✕
          </button>
        </div>
        <input
          type="text"
          autoFocus
          className="mt-1 w-full rounded border px-1 py-0.5 text-xs"
          placeholder="Runner name"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
        />
        <select
          className="mt-1 w-full rounded border px-1 py-0.5 text-xs"
          value={newSchoolId}
          onChange={(e) => setNewSchoolId(e.target.value)}
        >
          {allSchools.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
        <div className="mt-1 flex gap-1">
          <button
            type="button"
            className="flex-1 rounded bg-blue-600 px-2 py-0.5 text-xs text-white disabled:opacity-50"
            disabled={isSaving || !newName.trim()}
            onClick={handleCreate}
          >
            {isSaving ? "Adding…" : "Add & select"}
          </button>
          <button
            type="button"
            className="rounded bg-gray-200 px-2 py-0.5 text-xs"
            onClick={() => setIsCreating(false)}
          >
            Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-64 rounded border bg-white p-1 shadow">
      <div className="flex items-center gap-1">
        <input
          type="text"
          autoFocus
          className="w-full rounded border px-1 py-0.5 text-xs"
          placeholder="Search runner…"
          value={query}
          onChange={(e) => handleQueryChange(e.target.value)}
          onKeyDown={(e) => e.key === "Escape" && onCancel()}
        />
        <button type="button" className="text-xs text-gray-500" onClick={onCancel}>
          ✕
        </button>
      </div>
      {isSearching && <p className="text-xs text-gray-500">Searching…</p>}
      {matches.length > 0 && (
        <ul className="mt-1 max-h-40 divide-y overflow-y-auto">
          {matches.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                className="w-full py-0.5 text-left text-xs hover:bg-gray-50"
                onClick={() => onPick(m)}
              >
                {m.name}
                {m.duplicateCount > 1 && (
                  <span className="text-gray-500"> ({m.duplicateIndex})</span>
                )}
                {" — "}
                {m.schoolName}
                {m.isRetired && (
                  <span className="ml-1 text-amber-600">(retired)</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
      <button
        type="button"
        className="mt-1 w-full rounded bg-gray-100 px-2 py-0.5 text-left text-xs text-blue-600"
        onClick={() => {
          setNewName(query);
          setIsCreating(true);
        }}
      >
        + Add new runner{query.trim() ? ` "${query.trim()}"` : ""}
      </button>
    </div>
  );
}
