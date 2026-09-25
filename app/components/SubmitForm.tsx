"use client";

import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import type { RosterRunner, SaveResultRow, SubmittedResult } from "@/lib/results";
import type { RunnerSearchResult } from "@/lib/runners";
import type { ActionResult } from "@/lib/actionResult";
import { filterRoster } from "@/lib/rosterFilter";

type Row = {
  key: string;
  runnerId: string | null;
  /** Display name, including the "(2)" suffix for same-named runners. */
  runnerName: string;
  /** Set for a runner quick-added on this form until its first save creates them. */
  newRunnerName?: string;
  /** Set when picked via "Search other schools" — shown so it's clear who they are. */
  otherSchool?: string;
  position: string;
  /** What the server last stored for this row; null = not saved yet. */
  savedPosition: number | null;
  saving: boolean;
  error?: string;
};

const AUTOSAVE_DELAY_MS = 700;
const UNDO_MS = 6000;

let keyCounter = 0;
const newKey = () => `new-${Date.now()}-${keyCounter++}`;

/** A whole number ≥ 1, "blank", or "invalid" (decimals, zero, negatives). */
function parsePosition(value: string): number | "blank" | "invalid" {
  const s = value.trim();
  if (s === "") return "blank";
  if (!/^\d+$/.test(s)) return "invalid";
  const n = Number(s);
  return n >= 1 ? n : "invalid";
}

function existingToRows(existing: SubmittedResult[]): Row[] {
  return existing.map((r) => ({
    key: r.id,
    runnerId: r.runnerId,
    runnerName: r.runnerName,
    position: String(r.position),
    savedPosition: r.position,
    saving: false,
  }));
}

function displayName(r: { name: string; duplicateCount: number; duplicateIndex: number }) {
  return r.duplicateCount > 1 ? `${r.name} (${r.duplicateIndex})` : r.name;
}

/**
 * Teacher results entry for one (race, school). Each runner's row saves itself as soon
 * as it has a position (on Enter, leaving the box, or a short pause in typing), so
 * there's no Save button to forget and moving to another race never loses work.
 *
 * The server actions are passed in already bound to however the caller authenticates
 * (per-race token or school home page), so this component doesn't know or care which.
 */
export default function SubmitForm({
  isEditable,
  initialResults,
  roster,
  onSaveRow,
  onRemove,
  onRename,
  onSearchOtherSchools,
}: {
  isEditable: boolean;
  initialResults: SubmittedResult[];
  roster: RosterRunner[];
  onSaveRow: (row: SaveResultRow) => Promise<ActionResult<{ result: SubmittedResult }>>;
  onRemove: (resultId: string) => Promise<ActionResult>;
  onRename: (runnerId: string, newName: string) => Promise<ActionResult>;
  onSearchOtherSchools?: (
    query: string
  ) => Promise<ActionResult<{ matches: RunnerSearchResult[] }>>;
}) {
  const [rows, setRows] = useState<Row[]>(() => existingToRows(initialResults));
  // Mirror of `rows` that async save chains read, so they always see the latest edit.
  const rowsRef = useRef(rows);
  const [message, setMessage] = useState<string | null>(null);
  const [renamingKey, setRenamingKey] = useState<string | null>(null);
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const [undo, setUndo] = useState<Row | null>(null);

  // Per-row save queue: each row's saves (and its removal) run strictly one after
  // another, so a quick-added runner is only ever created once.
  const chains = useRef(new Map<string, Promise<void>>());
  // Last server result per row key — survives the row being removed from the list,
  // so a removal queued behind an in-flight save still knows which result to delete.
  const savedResults = useRef(new Map<string, SubmittedResult>());
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const positionInputs = useRef(new Map<string, HTMLInputElement>());
  const searchInputRef = useRef<HTMLInputElement>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const rosterIds = new Set(roster.map((r) => r.id));

  function mutate(fn: (prev: Row[]) => Row[]) {
    rowsRef.current = fn(rowsRef.current);
    setRows(rowsRef.current);
  }

  function patch(key: string, updates: Partial<Row>) {
    mutate((prev) => prev.map((r) => (r.key === key ? { ...r, ...updates } : r)));
  }

  function enqueue(key: string, task: () => Promise<void>) {
    const next = (chains.current.get(key) ?? Promise.resolve()).then(task, task);
    chains.current.set(key, next);
    return next;
  }

  function clearTimer(key: string) {
    const t = timers.current.get(key);
    if (t) clearTimeout(t);
    timers.current.delete(key);
  }

  function queueSave(key: string) {
    clearTimer(key);
    return enqueue(key, () => saveNow(key));
  }

  async function saveNow(key: string) {
    const row = rowsRef.current.find((r) => r.key === key);
    if (!row) return; // removed before its turn came
    const position = parsePosition(row.position);
    if (typeof position !== "number") return;
    if (position === row.savedPosition && !row.error) return;

    patch(key, { saving: true, error: undefined });
    let res: Awaited<ReturnType<typeof onSaveRow>>;
    try {
      res = await onSaveRow({
        runnerId: row.runnerId,
        newRunnerName: row.runnerId ? undefined : row.newRunnerName,
        position,
      });
    } catch {
      res = { error: "Couldn't reach the server — check your signal." };
    }

    if (res.error !== undefined) {
      patch(key, { saving: false, error: res.error });
      return;
    }
    const { result } = res;
    savedResults.current.set(key, result);
    const current = rowsRef.current.find((r) => r.key === key);
    if (!current) return; // removed mid-save; the queued removal deletes it
    patch(key, {
      saving: false,
      runnerId: result.runnerId,
      // Keep the picker's label (with its "(2)" suffix) for existing runners.
      runnerName: current.runnerId ? current.runnerName : result.runnerName,
      newRunnerName: undefined,
      savedPosition: result.position,
    });
  }

  function addRow(fields: Pick<Row, "runnerId" | "runnerName" | "newRunnerName" | "otherSchool">) {
    setMessage(null);
    const key = newKey();
    mutate((prev) => [...prev, { key, ...fields, position: "", savedPosition: null, saving: false }]);
    setFocusKey(key);
  }

  function changePosition(key: string, value: string) {
    patch(key, { position: value, error: undefined });
    clearTimer(key);
    timers.current.set(
      key,
      setTimeout(() => queueSave(key), AUTOSAVE_DELAY_MS)
    );
  }

  function commitPosition(key: string) {
    const row = rowsRef.current.find((r) => r.key === key);
    if (!row) return;
    // Blanking a saved position doesn't delete it — use × for that.
    if (row.position.trim() === "" && row.savedPosition !== null) {
      clearTimer(key);
      patch(key, { position: String(row.savedPosition) });
      return;
    }
    queueSave(key);
  }

  function removeRow(row: Row) {
    clearTimer(row.key);
    setMessage(null);
    mutate((prev) => prev.filter((r) => r.key !== row.key));
    showUndo(row);
    enqueue(row.key, async () => {
      const saved = savedResults.current.get(row.key);
      if (!saved) return;
      savedResults.current.delete(row.key);
      const res = await onRemove(saved.id).catch(() => ({ error: "Couldn't reach the server." }));
      if (res.error !== undefined) setMessage(`Couldn't remove ${row.runnerName}: ${res.error}`);
    });
  }

  function showUndo(row: Row) {
    if (undoTimer.current) clearTimeout(undoTimer.current);
    setUndo(row);
    undoTimer.current = setTimeout(() => setUndo(null), UNDO_MS);
  }

  function undoRemove() {
    if (!undo) return;
    if (undoTimer.current) clearTimeout(undoTimer.current);
    const saved = savedResults.current.get(undo.key);
    const runnerId = undo.runnerId ?? saved?.runnerId ?? null;
    const key = newKey();
    // Wait for the removal to finish so the re-save can't land before the delete.
    const removal = chains.current.get(undo.key) ?? Promise.resolve();
    chains.current.set(key, removal);
    mutate((prev) => [
      ...prev,
      {
        ...undo,
        key,
        runnerId,
        newRunnerName: runnerId ? undefined : undo.newRunnerName,
        savedPosition: null,
        saving: false,
        error: undefined,
      },
    ]);
    setUndo(null);
    queueSave(key);
  }

  async function saveRename(row: Row, newName: string) {
    setRenamingKey(null);
    const trimmed = newName.trim();
    if (!row.runnerId || !trimmed || trimmed === row.runnerName) return;
    patch(row.key, { runnerName: trimmed });
    const res = await onRename(row.runnerId, trimmed).catch(() => ({
      error: "Couldn't reach the server.",
    }));
    if (res.error !== undefined) {
      patch(row.key, { runnerName: row.runnerName });
      setMessage(res.error);
    }
  }

  // Picking a runner jumps straight to their position box (numeric keypad on phones).
  useEffect(() => {
    if (!focusKey) return;
    const input = positionInputs.current.get(focusKey);
    input?.focus();
    input?.scrollIntoView({ block: "center", behavior: "smooth" });
    setFocusKey(null);
  }, [focusKey]);

  const pending = rows.some(
    (r) =>
      r.saving ||
      r.error ||
      (typeof parsePosition(r.position) === "number" &&
        parsePosition(r.position) !== r.savedPosition)
  );

  // Only a full page unload can cut off a save; in-app navigation lets it finish.
  useEffect(() => {
    if (!pending) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [pending]);

  useEffect(
    () => () => {
      timers.current.forEach(clearTimeout);
      if (undoTimer.current) clearTimeout(undoTimer.current);
    },
    []
  );

  const positionCounts = new Map<number, number>();
  for (const r of rows) {
    const p = parsePosition(r.position);
    if (typeof p === "number") positionCounts.set(p, (positionCounts.get(p) ?? 0) + 1);
  }
  const duplicatePositions = [...positionCounts].filter(([, n]) => n > 1).map(([p]) => p);
  const missingPositions = rows.filter((r) => parsePosition(r.position) === "blank").length;
  const failed = rows.filter((r) => r.error);
  const saving = rows.some((r) => r.saving);

  let status: ReactNode = null;
  if (failed.length > 0) {
    status = (
      <span className="text-red-700">
        {failed.length === 1 ? `${failed[0].runnerName} couldn't save` : `${failed.length} couldn't save`}
        {" — "}
        <button
          type="button"
          className="font-medium underline"
          onClick={() => failed.forEach((r) => queueSave(r.key))}
        >
          Retry
        </button>
      </span>
    );
  } else if (saving || pending) {
    status = <span className="text-gray-600">Saving…</span>;
  } else if (rows.some((r) => r.savedPosition !== null)) {
    status = <span className="text-green-700">All changes saved ✓</span>;
  }

  return (
    <div className="mt-4 space-y-4">
      {isEditable && (status || undo || message) && (
        <div
          className="sticky top-0 z-10 -mx-4 space-y-1 border-b bg-white/95 px-4 py-2 text-sm backdrop-blur"
          aria-live="polite"
        >
          {status && <p>{status}</p>}
          {undo && (
            <p className="text-gray-700">
              Removed {undo.runnerName || undo.newRunnerName}{" "}
              <button type="button" className="font-medium text-blue-600 underline" onClick={undoRemove}>
                Undo
              </button>
            </p>
          )}
          {message && <p className="text-red-700">{message}</p>}
        </div>
      )}

      {rows.length === 0 && (
        <p className="rounded-lg bg-gray-50 p-3 text-sm text-gray-600">
          {isEditable
            ? "No runners entered yet — tap a name below (or type to find them), then type their position. Each runner saves automatically."
            : "No runners were entered for this race."}
        </p>
      )}

      <ul className="space-y-2">
        {rows.map((row) => {
          const canRename = isEditable && row.runnerId && rosterIds.has(row.runnerId);
          const isRenaming = renamingKey === row.key;
          const parsed = parsePosition(row.position);
          const isDuplicate = typeof parsed === "number" && duplicatePositions.includes(parsed);
          const inputTone = !isEditable
            ? ""
            : parsed === "invalid" || row.error
              ? "border-red-500 bg-red-50"
              : parsed === "blank" || isDuplicate
                ? "border-amber-400 bg-amber-50"
                : "";
          return (
            <li key={row.key} className="rounded-lg border p-2">
              <div className="flex items-center gap-2">
                {isRenaming ? (
                  <input
                    type="text"
                    autoFocus
                    defaultValue={row.runnerName}
                    className="min-h-[44px] flex-1 rounded border px-2 text-base"
                    onBlur={(e) => saveRename(row, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveRename(row, (e.target as HTMLInputElement).value);
                      if (e.key === "Escape") setRenamingKey(null);
                    }}
                  />
                ) : (
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">
                      {row.runnerName || row.newRunnerName}
                      {row.newRunnerName && <span className="ml-1 text-xs text-gray-500">(new)</span>}
                      {row.otherSchool && (
                        <span className="ml-1 text-xs text-gray-500">— {row.otherSchool}</span>
                      )}
                    </span>
                    {canRename && (
                      <button
                        type="button"
                        className="text-xs text-blue-600 underline"
                        onClick={() => setRenamingKey(row.key)}
                        title="Fix a misspelled name"
                      >
                        fix spelling
                      </button>
                    )}
                  </span>
                )}
                <span className="w-5 shrink-0 text-center text-sm" aria-hidden>
                  {row.saving ? (
                    <span className="text-gray-400">…</span>
                  ) : row.savedPosition !== null && parsed === row.savedPosition && !row.error ? (
                    <span className="text-green-600">✓</span>
                  ) : null}
                </span>
                <input
                  ref={(el) => {
                    if (el) positionInputs.current.set(row.key, el);
                    else positionInputs.current.delete(row.key);
                  }}
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  enterKeyHint="next"
                  autoComplete="off"
                  aria-label={`Finishing position for ${row.runnerName || row.newRunnerName}`}
                  className={`h-11 w-20 rounded border px-2 text-center text-lg ${inputTone}`}
                  placeholder="pos"
                  value={row.position}
                  disabled={!isEditable}
                  onChange={(e) => changePosition(row.key, e.target.value)}
                  onBlur={() => commitPosition(row.key)}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter") return;
                    e.preventDefault();
                    commitPosition(row.key);
                    searchInputRef.current?.focus();
                  }}
                />
                {isEditable && (
                  <button
                    type="button"
                    aria-label={`Remove ${row.runnerName || row.newRunnerName}`}
                    className="h-11 w-11 shrink-0 rounded text-xl text-red-600 hover:bg-red-50"
                    onClick={() => removeRow(row)}
                  >
                    ×
                  </button>
                )}
              </div>
              {isEditable && parsed === "invalid" && (
                <p className="mt-1 text-xs text-red-700">Position must be a whole number, 1 or more.</p>
              )}
              {isEditable && row.error && <p className="mt-1 text-xs text-red-700">{row.error}</p>}
            </li>
          );
        })}
      </ul>

      {isEditable && duplicatePositions.length > 0 && (
        <p className="text-sm text-amber-700">
          Two of your runners have the same position ({duplicatePositions.join(", ")}) — check
          they&apos;re right.
        </p>
      )}
      {isEditable && missingPositions > 0 && (
        <p className="text-sm text-amber-700">
          {missingPositions} runner{missingPositions === 1 ? " has" : "s have"} no position
          yet and won&apos;t be saved until you add one.
        </p>
      )}

      {isEditable && (
        <RunnerPicker
          inputRef={searchInputRef}
          roster={roster}
          existing={rows}
          onPick={addRow}
          onSearchOtherSchools={onSearchOtherSchools}
        />
      )}
    </div>
  );
}

function RunnerPicker({
  inputRef,
  roster,
  existing,
  onPick,
  onSearchOtherSchools,
}: {
  inputRef: RefObject<HTMLInputElement>;
  roster: RosterRunner[];
  existing: Row[];
  onPick: (fields: Pick<Row, "runnerId" | "runnerName" | "newRunnerName" | "otherSchool">) => void;
  onSearchOtherSchools?: (
    query: string
  ) => Promise<ActionResult<{ matches: RunnerSearchResult[] }>>;
}) {
  const [query, setQuery] = useState("");
  const [otherMatches, setOtherMatches] = useState<RunnerSearchResult[] | null>(null);
  const [otherError, setOtherError] = useState<string | null>(null);
  const [isSearchingOthers, setIsSearchingOthers] = useState(false);

  const usedRunnerIds = new Set(existing.map((r) => r.runnerId));
  const available = roster.filter((r) => !usedRunnerIds.has(r.id));
  const matches = filterRoster(available, query);
  const trimmed = query.trim();

  function reset() {
    setQuery("");
    setOtherMatches(null);
    setOtherError(null);
  }

  function pickRoster(r: RosterRunner) {
    onPick({ runnerId: r.id, runnerName: displayName(r) });
    reset();
  }

  function pickOther(m: RunnerSearchResult) {
    if (usedRunnerIds.has(m.id)) return;
    onPick({ runnerId: m.id, runnerName: displayName(m), otherSchool: m.schoolName });
    reset();
  }

  function quickAdd() {
    if (!trimmed) return;
    const exactRosterMatch = roster.find(
      (r) => r.name.trim().toLowerCase() === trimmed.toLowerCase()
    );
    if (exactRosterMatch) {
      const proceed = confirm(
        `There's already a "${exactRosterMatch.name}" on your roster. Add "${trimmed}" as a new, different runner anyway?`
      );
      if (!proceed) return;
    }
    onPick({ runnerId: null, runnerName: "", newRunnerName: trimmed });
    reset();
  }

  async function searchOthers() {
    if (!onSearchOtherSchools) return;
    setIsSearchingOthers(true);
    setOtherError(null);
    try {
      const res = await onSearchOtherSchools(trimmed);
      if (res.error !== undefined) setOtherError(res.error);
      else setOtherMatches(res.matches);
    } catch {
      setOtherError("Couldn't reach the server — check your signal.");
    } finally {
      setIsSearchingOthers(false);
    }
  }

  const buttonClass = "min-h-[44px] w-full py-2 text-left hover:bg-gray-50";

  return (
    <div className="rounded border p-2">
      <input
        ref={inputRef}
        type="search"
        enterKeyHint="done"
        autoComplete="off"
        className="min-h-[44px] w-full rounded border px-3 text-base"
        placeholder="Type a name to find a runner…"
        aria-label="Find a runner"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOtherMatches(null);
          setOtherError(null);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && trimmed && matches.length > 0) {
            e.preventDefault();
            pickRoster(matches[0]);
          }
          if (e.key === "Escape") reset();
        }}
      />

      {matches.length > 0 && (
        <ul className="mt-1 divide-y">
          {matches.map((r, i) => (
            <li key={r.id}>
              <button
                type="button"
                className={`${buttonClass} ${trimmed && i === 0 ? "font-medium" : ""}`}
                onClick={() => pickRoster(r)}
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
      {trimmed === "" && available.length === 0 && roster.length > 0 && (
        <p className="mt-1 text-xs text-gray-500">Everyone on your list has been added.</p>
      )}
      {trimmed !== "" && matches.length === 0 && (
        <p className="mt-1 text-xs text-gray-500">Nobody on your list matches &ldquo;{trimmed}&rdquo;.</p>
      )}

      {trimmed.length >= 2 && (
        <div className="mt-1 border-t pt-1">
          <button type="button" className={`${buttonClass} text-blue-600`} onClick={quickAdd}>
            + Add new runner &ldquo;{trimmed}&rdquo;
          </button>
          {onSearchOtherSchools && otherMatches === null && (
            <button
              type="button"
              className={`${buttonClass} text-sm text-gray-600`}
              onClick={searchOthers}
              disabled={isSearchingOthers}
            >
              {isSearchingOthers ? "Searching other schools…" : "Moved from another school? Search other schools"}
            </button>
          )}
          {otherError && <p className="text-xs text-red-700">{otherError}</p>}
          {otherMatches !== null &&
            (otherMatches.length === 0 ? (
              <p className="py-2 text-xs text-gray-500">No matches at other schools.</p>
            ) : (
              <ul className="divide-y">
                {otherMatches.map((m) => (
                  <li key={m.id}>
                    <button type="button" className={buttonClass} onClick={() => pickOther(m)}>
                      {displayName(m)}
                      <span className="text-sm text-gray-500"> — {m.schoolName}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ))}
        </div>
      )}
    </div>
  );
}
