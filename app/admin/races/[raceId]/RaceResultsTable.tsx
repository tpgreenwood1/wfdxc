"use client";

import { useMemo, useState, useTransition } from "react";
import type { AdminResultRow } from "@/lib/results";
import { updateResultAction } from "./actions";

export default function RaceResultsTable({
  raceId,
  initialRows,
}: {
  raceId: string;
  initialRows: AdminResultRow[];
}) {
  const [rows, setRows] = useState(initialRows);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showGaps, setShowGaps] = useState(true);
  const [isPending, startTransition] = useTransition();

  const sorted = useMemo(
    () => [...rows].sort((a, b) => a.position - b.position),
    [rows]
  );

  const positionCounts = useMemo(() => {
    const counts = new Map<number, number>();
    for (const r of rows) counts.set(r.position, (counts.get(r.position) ?? 0) + 1);
    return counts;
  }, [rows]);

  function saveposition(row: AdminResultRow, newPosition: number) {
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

  let previousPosition: number | null = null;

  return (
    <div>
      <label className="flex items-center gap-1 text-sm text-gray-600">
        <input
          type="checkbox"
          checked={showGaps}
          onChange={(e) => setShowGaps(e.target.checked)}
        />
        Highlight gaps
      </label>

      <table className="mt-2 w-full text-sm">
        <thead>
          <tr className="text-left">
            <th className="py-1">Pos</th>
            <th className="py-1">Runner</th>
            <th className="py-1">School</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => {
            const isDuplicate = (positionCounts.get(row.position) ?? 0) > 1;
            const hasGapBefore =
              showGaps && previousPosition !== null && row.position - previousPosition > 1;
            previousPosition = row.position;

            return (
              <tr
                key={row.id}
                className={
                  isDuplicate
                    ? "bg-red-100"
                    : hasGapBefore
                      ? "bg-amber-50"
                      : undefined
                }
              >
                <td className="py-1">
                  {editingId === row.id ? (
                    <input
                      type="number"
                      autoFocus
                      defaultValue={row.position}
                      className="w-16 rounded border px-1"
                      onBlur={(e) => saveposition(row, Number(e.target.value))}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          saveposition(row, Number((e.target as HTMLInputElement).value));
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
                <td className="py-1">{row.runnerName}</td>
                <td className="py-1">{row.schoolName}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {isPending && <p className="mt-1 text-xs text-gray-500">Saving…</p>}
    </div>
  );
}
