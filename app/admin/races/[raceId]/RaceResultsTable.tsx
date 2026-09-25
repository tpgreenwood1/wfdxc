"use client";

import { useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type { AdminResultRow } from "@/lib/results";
import type { RunnerSearchResult } from "@/lib/runners";
import {
  findRaceIssues,
  isValidPosition,
  MAX_POSITION,
  ordinal,
  type PositionAck,
} from "@/lib/raceIssues";
import AutoRefresh from "@/app/components/AutoRefresh";
import {
  applySteps,
  invertSteps,
  planCloseGap,
  planInsert,
  planMove,
  planSwap,
  summarizeMove,
  type PositionStep,
} from "@/lib/positionOps";
import {
  ackPositionAction,
  addResultAction,
  createRunnerAction,
  deleteResultAction,
  movePositionsAction,
  updateResultAction,
  type ActionResult,
} from "./actions";

type DisplayItem =
  | { kind: "result"; row: AdminResultRow; duplicate: "open" | "tie" | null; firstOfGroup: boolean }
  | { kind: "gap"; position: number; acknowledged: boolean; note: string | null };

type SchoolOption = { id: string; name: string };

/** Where a dragged (or tap-to-move) runner was dropped. */
type DropTarget = { kind: "row"; id: string } | { kind: "gap"; position: number };

type MoveOption = { label: string; detail: string; steps: PositionStep[] };

export default function RaceResultsTable({
  raceId,
  initialRows,
  initialAcks,
  allSchools,
  alsoIn = {},
  autoRefresh = false,
}: {
  raceId: string;
  initialRows: AdminResultRow[];
  initialAcks: PositionAck[];
  allSchools: SchoolOption[];
  /** runnerId -> other races at this event the runner is also entered in. */
  alsoIn?: Record<string, string[]>;
  autoRefresh?: boolean;
}) {
  const [rows, setRows] = useState(initialRows);
  const [acks, setAcks] = useState(initialAcks);
  const [editing, setEditing] = useState<
    | { kind: "position"; id: string }
    | { kind: "runner"; id: string }
    | { kind: "school"; id: string }
    | { kind: "gap"; position: number }
    | { kind: "gapNote"; position: number }
    | null
  >(null);
  const [isAdding, setIsAdding] = useState(false);
  const [newPosition, setNewPosition] = useState("1");
  const [hideAccepted, setHideAccepted] = useState(false);
  const [filter, setFilter] = useState("");
  const [error, setError] = useState<string | null>(null);
  // Tap-to-move: the runner picked up by tapping their handle (touch/keyboard
  // alternative to dragging).
  const [moving, setMoving] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  // Dropped onto another runner: which of swap / insert / tie did they mean?
  const [choice, setChoice] = useState<{ sourceId: string; targetId: string } | null>(null);
  const [undo, setUndo] = useState<{ message: string; steps: PositionStep[] } | null>(null);
  const [isPending, startTransition] = useTransition();
  const addPanelRef = useRef<HTMLDivElement>(null);

  // A small movement threshold keeps a tap on the handle a tap (→ tap-to-move),
  // and the handle is touch-action:none so dragging it doesn't scroll the page.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  // Server revalidation after each action sends fresh props — adopt them so the
  // table always ends up showing what's actually saved.
  useEffect(() => setRows(initialRows), [initialRows]);
  useEffect(() => setAcks(initialAcks), [initialAcks]);

  useEffect(() => {
    if (!moving && !choice) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMoving(null);
        setChoice(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [moving, choice]);

  const issues = useMemo(() => findRaceIssues(rows, acks), [rows, acks]);
  const maxPosition = useMemo(() => rows.reduce((m, r) => Math.max(m, r.position), 0), [rows]);
  const rowById = useMemo(() => new Map(rows.map((r) => [r.id, r])), [rows]);

  const display = useMemo<DisplayItem[]>(() => {
    const q = filter.trim().toLowerCase();
    const dupByPosition = new Map(issues.duplicates.map((d) => [d.position, d]));
    const sorted = [...rows]
      .filter(
        (r) =>
          !q || r.runnerName.toLowerCase().includes(q) || r.schoolName.toLowerCase().includes(q)
      )
      .sort((a, b) => a.position - b.position || a.runnerName.localeCompare(b.runnerName));

    const items: DisplayItem[] = [];
    let lastPosition: number | null = null;
    for (const row of sorted) {
      const dup = dupByPosition.get(row.position);
      items.push({
        kind: "result",
        row,
        duplicate: dup ? (dup.acknowledged ? "tie" : "open") : null,
        firstOfGroup: row.position !== lastPosition,
      });
      lastPosition = row.position;
    }
    // Gap placeholders only make sense against the full, unfiltered field.
    if (!q) {
      for (const gap of issues.gaps) {
        if (hideAccepted && gap.acknowledged) continue;
        items.push({ kind: "gap", ...gap });
      }
    }
    const pos = (i: DisplayItem) => (i.kind === "gap" ? i.position : i.row.position);
    return items.sort((a, b) => pos(a) - pos(b));
  }, [rows, issues, filter, hideAccepted]);

  /** Runs a server action with an optimistic update, rolling back on failure. */
  function run(
    optimistic: () => void,
    action: () => Promise<ActionResult>,
    rollback: { rows: AdminResultRow[]; acks: PositionAck[] },
    onSuccess?: () => void
  ) {
    setError(null);
    optimistic();
    startTransition(async () => {
      let result: ActionResult;
      try {
        result = await action();
      } catch {
        result = { error: "Couldn't save — check your connection and try again." };
      }
      if (result.error) {
        setRows(rollback.rows);
        setAcks(rollback.acks);
        setError(result.error);
      } else {
        onSuccess?.();
      }
    });
  }

  const snapshot = () => ({ rows, acks });
  const fd = (fields: Record<string, string>) => {
    const f = new FormData();
    f.set("raceId", raceId);
    for (const [k, v] of Object.entries(fields)) f.set(k, v);
    return f;
  };

  /** "Sam → 5th · 3 others move down one" — what a move does, for captions and the undo bar. */
  function describe(steps: PositionStep[], movedId?: string): string {
    const out = applySteps(rows, acks, steps);
    if ("error" in out) return out.error;
    const { up, down } = summarizeMove(rows, out.rows, movedId);
    const others = (n: number, dir: string) =>
      `${n} ${movedId ? "other" : "runner"}${n === 1 ? "" : "s"} move${n === 1 ? "s" : ""} ${dir} one`;
    const parts: string[] = [];
    if (down) parts.push(others(down, "down"));
    if (up) parts.push(others(up, "up"));
    return parts.join(", ") || "no one else moves";
  }

  /** Applies a position change optimistically and saves it; offers Undo afterwards. */
  function applyMove(steps: PositionStep[], message: string, undoable = true) {
    setMoving(null);
    setChoice(null);
    setEditing(null);
    if (steps.length === 0) return;
    const out = applySteps(rows, acks, steps);
    if ("error" in out) {
      setError(out.error);
      return;
    }
    const inverse = invertSteps(rows, steps);
    setUndo(null);
    run(
      () => {
        setRows(out.rows);
        setAcks(out.acks);
      },
      () => movePositionsAction(fd({ steps: JSON.stringify(steps) })),
      snapshot(),
      undoable ? () => setUndo({ message, steps: inverse }) : undefined
    );
  }

  function undoLast() {
    if (!undo) return;
    applyMove(undo.steps, "", false);
  }

  /** Swap / insert / tie when dropping onto another runner. */
  function moveOptions(source: AdminResultRow, target: AdminResultRow): MoveOption[] {
    const p = target.position;
    if (source.position === p) {
      // Already sharing a place: say who finished first.
      const ahead = planInsert(rows, source.id, p);
      const behind = planInsert(rows, source.id, p + 1);
      return [
        {
          label: `${source.runnerName} ahead of ${target.runnerName}`,
          detail: `${source.runnerName} keeps ${ordinal(p)} · ${describe(ahead, source.id)}`,
          steps: ahead,
        },
        {
          label: `${target.runnerName} ahead of ${source.runnerName}`,
          detail: `${source.runnerName} → ${ordinal(p + 1)} · ${describe(behind, source.id)}`,
          steps: behind,
        },
      ];
    }
    const insert = planInsert(rows, source.id, p);
    return [
      {
        label: `Put ${source.runnerName} at ${ordinal(p)}`,
        detail: describe(insert, source.id),
        steps: insert,
      },
      {
        label: "Swap places",
        detail: `${source.runnerName} → ${ordinal(p)}, ${target.runnerName} → ${ordinal(source.position)}`,
        steps: planSwap(rows, source.id, target.id),
      },
      {
        label: `Share ${ordinal(p)} (tie)`,
        detail: `${source.runnerName} and ${target.runnerName} both ${ordinal(p)}`,
        steps: planMove(source.id, p),
      },
    ];
  }

  function dropOn(sourceId: string, target: DropTarget) {
    setMoving(null);
    const source = rowById.get(sourceId);
    if (!source) return;
    if (target.kind === "gap") {
      const steps = planMove(sourceId, target.position);
      applyMove(steps, `${source.runnerName} → ${ordinal(target.position)}`);
      return;
    }
    if (target.id === sourceId) return;
    setEditing(null);
    setChoice({ sourceId, targetId: target.id });
  }

  function savePosition(row: AdminResultRow, raw: string) {
    setEditing(null);
    const position = Number(raw);
    if (raw.trim() === "" || position === row.position) return;
    if (!isValidPosition(position)) {
      setError(`Place must be a whole number from 1 to ${MAX_POSITION}.`);
      return;
    }
    applyMove(planMove(row.id, position), `${row.runnerName} → ${ordinal(position)}`);
  }

  function saveRunner(row: AdminResultRow, match: RunnerSearchResult) {
    setEditing(null);
    const snap = snapshot();
    run(
      () =>
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
        ),
      () =>
        updateResultAction(fd({ resultId: row.id, runnerId: match.id, schoolId: match.schoolId })),
      snap
    );
  }

  function saveSchool(row: AdminResultRow, schoolId: string) {
    setEditing(null);
    const school = allSchools.find((s) => s.id === schoolId);
    if (!school || schoolId === row.schoolId) return;
    const snap = snapshot();
    run(
      () =>
        setRows((prev) =>
          prev.map((r) => (r.id === row.id ? { ...r, schoolId, schoolName: school.name } : r))
        ),
      () => updateResultAction(fd({ resultId: row.id, schoolId })),
      snap
    );
  }

  function addResultAt(position: number, match: RunnerSearchResult, keepAdding = false) {
    setEditing(null);
    if (!keepAdding) setIsAdding(false);
    else setNewPosition(String(position + 1));
    setError(null);
    startTransition(async () => {
      let result: Awaited<ReturnType<typeof addResultAction>>;
      try {
        result = await addResultAction(
          fd({ runnerId: match.id, schoolId: match.schoolId, position: String(position) })
        );
      } catch {
        result = { error: "Couldn't save — check your connection and try again." };
      }
      if (result.error || !result.id) {
        setError(result.error ?? "Couldn't add that result.");
        return;
      }
      const id = result.id;
      // Revalidated props may already have delivered this row.
      setRows((prev) => prev.some((r) => r.id === id) ? prev : [
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
    if (!confirm(`Delete ${row.runnerName}'s result (${ordinal(row.position)})?`)) return;
    const snap = snapshot();
    setUndo(null);
    run(
      () => setRows((prev) => prev.filter((r) => r.id !== row.id)),
      () => deleteResultAction(fd({ resultId: row.id })),
      snap
    );
  }

  function setAck(position: number, kind: "tie" | "gap", on: boolean, note = "") {
    setEditing(null);
    const snap = snapshot();
    run(
      () =>
        setAcks((prev) => {
          const rest = prev.filter((a) => !(a.position === position && a.kind === kind));
          // Mirrors the server, which records how many share a tie when it's accepted.
          const runnerCount =
            kind === "tie" ? rows.filter((r) => r.position === position).length : null;
          return on ? [...rest, { position, kind, note: note.trim() || null, runnerCount }] : rest;
        }),
      () =>
        ackPositionAction(
          fd({ position: String(position), kind, note, ...(on ? {} : { clear: "1" }) })
        ),
      snap
    );
  }

  function openAddPanel() {
    setNewPosition(String(maxPosition + 1));
    setIsAdding(true);
    setTimeout(() => addPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 0);
  }

  const btn = "min-h-[40px] rounded px-3 text-sm";
  const movingRow = moving ? rowById.get(moving) : undefined;
  const draggingRow = dragging ? rowById.get(dragging) : undefined;
  const targeting = !!movingRow;
  // Fresh server data would reset the list under an in-progress edit or drag.
  const busy = !!(editing || moving || dragging || choice || isAdding || isPending);

  return (
    <div>
      {autoRefresh && (
        <div className="mb-1">
          <AutoRefresh paused={busy} />
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          placeholder="Find runner or school…"
          className="min-h-[40px] flex-1 rounded border px-2 text-sm sm:max-w-xs"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <label className="flex items-center gap-1 text-sm text-gray-600">
          <input
            type="checkbox"
            checked={hideAccepted}
            onChange={(e) => setHideAccepted(e.target.checked)}
          />
          Hide accepted gaps
        </label>
        {!isAdding && (
          <button type="button" className={`${btn} bg-blue-600 text-white`} onClick={openAddPanel}>
            + Add result
          </button>
        )}
      </div>
      {rows.length > 1 && (
        <p className="mt-1 text-xs text-gray-500">
          To move a runner, drag <span aria-hidden>⠿</span> onto a place — or tap{" "}
          <span aria-hidden>⠿</span>, then tap where they should go.
        </p>
      )}

      {error && (
        <div
          role="alert"
          className="mt-2 flex items-start justify-between gap-2 rounded bg-red-100 p-2 text-sm text-red-900"
        >
          <span>{error}</span>
          <button type="button" className="px-1" onClick={() => setError(null)} aria-label="Dismiss">
            ✕
          </button>
        </div>
      )}

      {isAdding && (
        <div ref={addPanelRef} className="mt-2 space-y-2 rounded border bg-blue-50 p-2">
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-700" htmlFor="new-position">
              Place
            </label>
            <input
              id="new-position"
              type="number"
              inputMode="numeric"
              min={1}
              value={newPosition}
              onChange={(e) => setNewPosition(e.target.value)}
              className="min-h-[40px] w-20 rounded border px-2"
            />
            <span className="text-xs text-gray-500">
              Pick a runner — the place goes up by one so you can keep adding.
            </span>
          </div>
          <RunnerPicker
            raceId={raceId}
            allSchools={allSchools}
            onPick={(match) => {
              const position = Number(newPosition);
              if (!isValidPosition(position)) {
                setError(`Place must be a whole number from 1 to ${MAX_POSITION}.`);
                return;
              }
              addResultAt(position, match, true);
            }}
            onCancel={() => setIsAdding(false)}
          />
        </div>
      )}

      {movingRow && (
        <div className="sticky top-0 z-20 mt-2 flex flex-wrap items-center gap-2 rounded bg-blue-700 p-2 text-sm text-white shadow">
          <span className="flex-1">
            Moving <strong>{movingRow.runnerName}</strong> ({ordinal(movingRow.position)}) — tap an
            empty place or another runner.
          </span>
          <button
            type="button"
            className="min-h-[36px] rounded bg-white/20 px-3"
            onClick={() => setMoving(null)}
          >
            Cancel
          </button>
        </div>
      )}

      <DndContext
        id="race-results"
        sensors={sensors}
        onDragStart={(e) => {
          setDragging(String(e.active.id));
          setMoving(null);
          setChoice(null);
          setEditing(null);
        }}
        onDragEnd={(e) => {
          setDragging(null);
          const target = e.over?.data.current as DropTarget | undefined;
          if (target) dropOn(String(e.active.id), target);
        }}
        onDragCancel={() => setDragging(null)}
      >
        <ol className="mt-2 divide-y rounded border">
          {display.map((item) => {
            if (item.kind === "gap") {
              const p = item.position;
              return (
                <DropSlot
                  key={`gap-${p}`}
                  id={`gap-${p}`}
                  domId={`pos-${p}`}
                  target={{ kind: "gap", position: p }}
                  targeting={targeting}
                  onTap={() => moving && dropOn(moving, { kind: "gap", position: p })}
                  className={item.acknowledged ? "bg-gray-50" : "bg-amber-50"}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="w-8 shrink-0" />
                    <span className="w-12 font-semibold text-gray-500">{ordinal(p)}</span>
                    {targeting ? (
                      <span className="flex-1 text-sm font-medium text-blue-800">
                        Move {movingRow?.runnerName} here
                      </span>
                    ) : item.acknowledged ? (
                      <>
                        <span className="flex-1 text-sm italic text-gray-500">
                          No league runner{item.note ? ` — ${item.note}` : ""}
                        </span>
                        <button
                          type="button"
                          className="text-sm text-blue-600 underline"
                          onClick={() => setAck(p, "gap", false)}
                        >
                          Undo
                        </button>
                      </>
                    ) : (
                      <>
                        <span className="flex-1 text-sm font-medium text-amber-900">
                          Missing place
                        </span>
                        <button
                          type="button"
                          className={`${btn} bg-white ring-1 ring-amber-300`}
                          onClick={() => setEditing({ kind: "gap", position: p })}
                        >
                          Add runner
                        </button>
                        <button
                          type="button"
                          className={`${btn} bg-white ring-1 ring-amber-300`}
                          onClick={() =>
                            applyMove(
                              planCloseGap(p),
                              `Closed up ${ordinal(p)} · ${describe(planCloseGap(p))}`
                            )
                          }
                          title="Nobody finished here — everyone after moves up one place"
                        >
                          Close up ↑
                        </button>
                        <button
                          type="button"
                          className={`${btn} bg-white ring-1 ring-gray-300`}
                          onClick={() => setEditing({ kind: "gapNote", position: p })}
                          title="Someone finished here who isn't in the league (non-league runner, lost ticket…) — keep the place empty"
                        >
                          No one to add
                        </button>
                      </>
                    )}
                  </div>
                  {editing?.kind === "gap" && editing.position === p && (
                    <div className="mt-2">
                      <RunnerPicker
                        raceId={raceId}
                        allSchools={allSchools}
                        onPick={(match) => addResultAt(p, match)}
                        onCancel={() => setEditing(null)}
                      />
                    </div>
                  )}
                  {editing?.kind === "gapNote" && editing.position === p && (
                    <GapNoteForm
                      onSave={(note) => setAck(p, "gap", true, note)}
                      onCancel={() => setEditing(null)}
                    />
                  )}
                </DropSlot>
              );
            }

            const { row, duplicate, firstOfGroup } = item;
            const tone =
              duplicate === "open" ? "bg-red-50" : duplicate === "tie" ? "bg-gray-50" : "";
            const isSource = row.id === moving || row.id === dragging;
            const group = duplicate === "open" && firstOfGroup
              ? rows.filter((r) => r.position === row.position)
              : [];
            const choiceSource =
              choice?.targetId === row.id ? rowById.get(choice.sourceId) : undefined;
            return (
              <DropSlot
                key={row.id}
                id={`row-${row.id}`}
                domId={firstOfGroup ? `pos-${row.position}` : undefined}
                target={{ kind: "row", id: row.id }}
                targeting={targeting}
                onTap={() => moving && dropOn(moving, { kind: "row", id: row.id })}
                className={`${tone} ${isSource ? "opacity-50" : ""} ${
                  choiceSource ? "ring-2 ring-inset ring-blue-500" : ""
                }`}
              >
                {duplicate && firstOfGroup && !targeting && (
                  <div
                    className={`mb-2 text-sm ${
                      duplicate === "open" ? "text-red-900" : "text-gray-600"
                    }`}
                  >
                    {duplicate === "open" ? (
                      <>
                        <p className="font-medium">
                          {group.length} runners on {ordinal(row.position)} — who finished
                          behind?
                        </p>
                        <div className="mt-1 flex flex-wrap gap-2">
                          {group.length <= 3 &&
                            group.map((r) => {
                              const steps = planInsert(rows, r.id, row.position + 1);
                              const detail = describe(steps, r.id);
                              return (
                                <button
                                  key={r.id}
                                  type="button"
                                  className={`${btn} bg-white text-left ring-1 ring-red-300`}
                                  title={detail}
                                  onClick={() =>
                                    applyMove(
                                      steps,
                                      `${r.runnerName} → ${ordinal(row.position + 1)} · ${detail}`
                                    )
                                  }
                                >
                                  {r.runnerName} → {ordinal(row.position + 1)}
                                  <span className="block text-xs text-gray-500">{detail}</span>
                                </button>
                              );
                            })}
                          <button
                            type="button"
                            className={`${btn} bg-white text-left ring-1 ring-red-300`}
                            onClick={() => setAck(row.position, "tie", true)}
                          >
                            Accept tie
                            <span className="block text-xs text-gray-500">
                              all keep {ordinal(row.position)}
                            </span>
                          </button>
                        </div>
                      </>
                    ) : (
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="flex-1">Tie accepted on {ordinal(row.position)}</span>
                        <button
                          type="button"
                          className="text-blue-600 underline"
                          onClick={() => setAck(row.position, "tie", false)}
                        >
                          Undo
                        </button>
                      </div>
                    )}
                  </div>
                )}
                <div className="flex items-start gap-2">
                  <DragHandle
                    id={row.id}
                    label={row.runnerName}
                    selected={row.id === moving}
                    onTap={() => {
                      setChoice(null);
                      setEditing(null);
                      setMoving((m) => (m === row.id ? null : row.id));
                    }}
                  />
                  <div className="w-12 shrink-0">
                    {editing?.kind === "position" && editing.id === row.id ? (
                      <input
                        type="number"
                        inputMode="numeric"
                        min={1}
                        autoFocus
                        defaultValue={row.position}
                        className="min-h-[40px] w-14 rounded border px-1"
                        onBlur={(e) => savePosition(row, e.target.value)}
                        onKeyDown={(e) => {
                          // Save happens once, in onBlur.
                          if (e.key === "Enter") e.currentTarget.blur();
                          if (e.key === "Escape") setEditing(null);
                        }}
                      />
                    ) : (
                      <button
                        type="button"
                        className={`min-h-[40px] w-12 rounded text-left font-semibold underline decoration-dotted ${
                          duplicate === "open" ? "text-red-700" : ""
                        }`}
                        onClick={() => setEditing({ kind: "position", id: row.id })}
                        title="Type a new place"
                      >
                        {ordinal(row.position, duplicate === "tie")}
                      </button>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    {editing?.kind === "runner" && editing.id === row.id ? (
                      <RunnerPicker
                        raceId={raceId}
                        allSchools={allSchools}
                        defaultSchoolId={row.schoolId}
                        onPick={(match) => saveRunner(row, match)}
                        onCancel={() => setEditing(null)}
                      />
                    ) : (
                      <button
                        type="button"
                        className="min-h-[24px] text-left font-medium underline decoration-dotted"
                        onClick={() => setEditing({ kind: "runner", id: row.id })}
                        title="Swap for a different runner"
                      >
                        {row.runnerName}
                      </button>
                    )}
                    <div className="text-sm text-gray-600">
                      {editing?.kind === "school" && editing.id === row.id ? (
                        <select
                          autoFocus
                          className="min-h-[40px] w-full rounded border px-1 sm:w-auto"
                          defaultValue={row.schoolId}
                          onChange={(e) => saveSchool(row, e.target.value)}
                          onBlur={() => setEditing(null)}
                        >
                          {allSchools.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <button
                          type="button"
                          className="text-left underline decoration-dotted"
                          onClick={() => setEditing({ kind: "school", id: row.id })}
                          title="Change which school this runner ran for in this race"
                        >
                          Ran for {row.schoolName}
                        </button>
                      )}
                    </div>
                    {alsoIn[row.runnerId] && (
                      <p className="mt-0.5 text-xs font-medium text-amber-800">
                        ⚠ Also entered in {alsoIn[row.runnerId].join(", ")}
                      </p>
                    )}
                  </div>

                  {targeting && row.id !== moving ? (
                    <span className="shrink-0 self-center text-sm font-medium text-blue-800">
                      Here
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="min-h-[40px] shrink-0 px-2 text-sm text-red-600"
                      onClick={() => removeRow(row)}
                      aria-label={`Delete ${row.runnerName}'s result`}
                    >
                      Delete
                    </button>
                  )}
                </div>
                {choiceSource && (
                  <div className="mt-2 rounded bg-blue-50 p-2">
                    <p className="text-sm font-medium text-blue-900">
                      Move {choiceSource.runnerName} ({ordinal(choiceSource.position)}) here:
                    </p>
                    <div className="mt-1 flex flex-wrap gap-2">
                      {moveOptions(choiceSource, row).map((o, i) => (
                        <button
                          key={o.label}
                          type="button"
                          autoFocus={i === 0}
                          className={`${btn} text-left ${
                            i === 0 ? "bg-blue-600 text-white" : "bg-white ring-1 ring-blue-300"
                          }`}
                          onClick={() => applyMove(o.steps, `${o.label} · ${o.detail}`)}
                        >
                          {o.label}
                          <span
                            className={`block text-xs ${i === 0 ? "text-blue-100" : "text-gray-500"}`}
                          >
                            {o.detail}
                          </span>
                        </button>
                      ))}
                      <button
                        type="button"
                        className={`${btn} text-gray-600`}
                        onClick={() => setChoice(null)}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </DropSlot>
            );
          })}
        </ol>
        <DragOverlay>
          {draggingRow ? (
            <div className="rounded bg-white px-3 py-2 text-sm font-medium shadow-lg ring-2 ring-blue-500">
              {ordinal(draggingRow.position)} · {draggingRow.runnerName}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
      {display.length === 0 && (
        <p className="mt-2 text-sm text-gray-500">
          {filter ? `No results match "${filter}".` : "No results entered yet."}
        </p>
      )}
      <p className="mt-1 h-4 text-xs text-gray-500">{isPending ? "Saving…" : ""}</p>

      {undo && (
        <div
          role="status"
          className="fixed inset-x-4 bottom-20 z-30 mx-auto flex max-w-lg items-center gap-2 rounded bg-gray-900 p-2 pl-3 text-sm text-white shadow-lg sm:bottom-4"
        >
          <span className="flex-1">{undo.message}</span>
          <button
            type="button"
            className="min-h-[36px] rounded bg-white/20 px-3 font-medium"
            onClick={undoLast}
            disabled={isPending}
          >
            Undo
          </button>
          <button
            type="button"
            className="px-1 text-gray-300"
            onClick={() => setUndo(null)}
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      )}

      {!isAdding && (
        <button
          type="button"
          onClick={openAddPanel}
          className="fixed bottom-4 right-4 z-10 rounded-full bg-blue-600 px-5 py-3 text-white shadow-lg sm:hidden"
        >
          + Add result
        </button>
      )}
    </div>
  );
}

/** A list row that a runner can be dropped on — by drag, or by tapping it while a
 * runner is picked up (clicks inside are captured so they don't also edit the row). */
function DropSlot({
  id,
  domId,
  target,
  targeting,
  onTap,
  className,
  children,
}: {
  id: string;
  domId?: string;
  target: DropTarget;
  targeting: boolean;
  onTap: () => void;
  className: string;
  children: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id, data: target });
  return (
    <li
      ref={setNodeRef}
      id={domId}
      className={`scroll-mt-24 p-2 ${className} ${
        isOver ? "bg-blue-100 ring-2 ring-inset ring-blue-500" : ""
      } ${targeting ? "cursor-pointer hover:bg-blue-50" : ""}`}
      role={targeting ? "button" : undefined}
      tabIndex={targeting ? 0 : undefined}
      onClickCapture={
        targeting
          ? (e) => {
              e.preventDefault();
              e.stopPropagation();
              onTap();
            }
          : undefined
      }
      onKeyDown={
        targeting
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onTap();
              }
            }
          : undefined
      }
    >
      {children}
    </li>
  );
}

function DragHandle({
  id,
  label,
  selected,
  onTap,
}: {
  id: string;
  label: string;
  selected: boolean;
  onTap: () => void;
}) {
  const { attributes, listeners, setNodeRef } = useDraggable({ id });
  return (
    <button
      ref={setNodeRef}
      type="button"
      {...attributes}
      {...listeners}
      onClick={onTap}
      aria-label={`Move ${label}`}
      aria-pressed={selected}
      title="Drag to a new place, or tap then tap where they should go"
      className={`min-h-[40px] w-8 shrink-0 cursor-grab touch-none rounded text-lg leading-none active:cursor-grabbing ${
        selected ? "bg-blue-600 text-white" : "text-gray-400 hover:bg-gray-100"
      }`}
    >
      ⠿
    </button>
  );
}

function GapNoteForm({
  onSave,
  onCancel,
}: {
  onSave: (note: string) => void;
  onCancel: () => void;
}) {
  const [note, setNote] = useState("");
  return (
    <form
      className="mt-2 flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(note);
      }}
    >
      <input
        autoFocus
        className="min-h-[40px] flex-1 rounded border px-2 text-sm"
        placeholder="Optional note, e.g. non-league runner"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <button type="submit" className="min-h-[40px] rounded bg-gray-800 px-3 text-sm text-white">
        Mark as no one
      </button>
      <button type="button" className="min-h-[40px] px-2 text-sm" onClick={onCancel}>
        Cancel
      </button>
    </form>
  );
}

const SEARCH_DEBOUNCE_MS = 250;

function RunnerPicker({
  raceId,
  allSchools,
  defaultSchoolId = "",
  onPick,
  onCancel,
}: {
  raceId: string;
  allSchools: SchoolOption[];
  /** School preselected for a new runner — the row's school when replacing a runner;
   * otherwise none, so the admin has to choose rather than inherit the first school. */
  defaultSchoolId?: string;
  onPick: (match: RunnerSearchResult) => void;
  onCancel: () => void;
}) {
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<RunnerSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newSchoolId, setNewSchoolId] = useState(defaultSchoolId);
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
          `/admin/api/runners/search?q=${encodeURIComponent(value)}&includeRetired=true`
        );
        const data = (await res.json()) as RunnerSearchResult[];
        setMatches(data);
      } finally {
        setIsSearching(false);
      }
    }, SEARCH_DEBOUNCE_MS);
  }

  function pick(match: RunnerSearchResult) {
    setQuery("");
    setMatches([]);
    onPick(match);
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
      setIsCreating(false);
      setNewName("");
      pick({ ...runner, duplicateIndex: 1, duplicateCount: 1, isRetired: false });
    } catch {
      setError("Couldn't add runner.");
    } finally {
      setIsSaving(false);
    }
  }

  const box = "w-full rounded border bg-white p-2 shadow sm:max-w-md";

  if (isCreating) {
    return (
      <div className={box}>
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-gray-700">New runner</span>
          <button type="button" className="px-2 text-gray-500" onClick={onCancel} aria-label="Cancel">
            ✕
          </button>
        </div>
        <input
          type="text"
          autoFocus
          className="mt-1 min-h-[40px] w-full rounded border px-2 text-sm"
          placeholder="Runner name"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
        />
        <select
          className="mt-1 min-h-[40px] w-full rounded border px-2 text-sm"
          value={newSchoolId}
          onChange={(e) => setNewSchoolId(e.target.value)}
          aria-label="School"
        >
          <option value="" disabled>
            Choose school…
          </option>
          {allSchools.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            className="min-h-[40px] flex-1 rounded bg-blue-600 px-2 text-sm text-white disabled:opacity-50"
            disabled={isSaving || !newName.trim() || !newSchoolId}
            onClick={handleCreate}
          >
            {isSaving ? "Adding…" : "Add & select"}
          </button>
          <button
            type="button"
            className="min-h-[40px] rounded bg-gray-200 px-3 text-sm"
            onClick={() => setIsCreating(false)}
          >
            Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={box}>
      <div className="flex items-center gap-1">
        <input
          type="search"
          autoFocus
          className="min-h-[40px] w-full rounded border px-2 text-sm"
          placeholder="Search runner by name…"
          value={query}
          onChange={(e) => handleQueryChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") onCancel();
            if (e.key === "Enter" && matches[0]) {
              e.preventDefault();
              pick(matches[0]);
            }
          }}
        />
        <button type="button" className="px-2 text-gray-500" onClick={onCancel} aria-label="Cancel">
          ✕
        </button>
      </div>
      {isSearching && <p className="mt-1 text-xs text-gray-500">Searching…</p>}
      {matches.length > 0 && (
        <ul className="mt-1 max-h-60 divide-y overflow-y-auto">
          {matches.map((m, i) => (
            <li key={m.id}>
              <button
                type="button"
                className={`min-h-[40px] w-full px-1 text-left text-sm hover:bg-gray-50 ${
                  i === 0 ? "bg-blue-50/50" : ""
                }`}
                onClick={() => pick(m)}
              >
                {m.name}
                {m.duplicateCount > 1 && (
                  <span className="text-gray-500"> ({m.duplicateIndex})</span>
                )}
                <span className="text-gray-500"> — {m.schoolName}</span>
                {m.isRetired && <span className="ml-1 text-amber-600">(retired)</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      <button
        type="button"
        className="mt-1 min-h-[40px] w-full rounded bg-gray-100 px-2 text-left text-sm text-blue-700"
        onClick={() => {
          setNewName(query);
          setIsCreating(true);
        }}
      >
        + New runner{query.trim() ? ` "${query.trim()}"` : ""}
      </button>
    </div>
  );
}
