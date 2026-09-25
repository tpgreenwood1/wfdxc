"use client";

import { useState, useTransition } from "react";
import { moveSchoolEntriesAction } from "./actions";

type Target = { id: string; label: string; status: string };

/** "Move entries…" for one school on the race page: results typed into the wrong race
 * go across to another race in the same event in one go. */
export default function MoveEntries({
  raceId,
  schoolId,
  schoolName,
  entered,
  raceLabel,
  targets,
}: {
  raceId: string;
  schoolId: string;
  schoolName: string;
  entered: number;
  raceLabel: string;
  targets: Target[];
}) {
  const [open, setOpen] = useState(false);
  const [toRaceId, setToRaceId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!open) {
    return (
      <button
        type="button"
        className="min-h-[32px] rounded bg-gray-100 px-2 text-xs"
        onClick={() => setOpen(true)}
      >
        Move entries…
      </button>
    );
  }

  function move() {
    const target = targets.find((t) => t.id === toRaceId);
    if (!target) {
      setError("Pick the race to move them to.");
      return;
    }
    const finalised = target.status === "closed" ? " That race is finalised, so its public results update too." : "";
    if (
      !confirm(
        `Move all ${entered} of ${schoolName}'s results from ${raceLabel} to ${target.label}? Their places stay the same.${finalised}`
      )
    ) {
      return;
    }
    setError(null);
    const fd = new FormData();
    fd.set("raceId", raceId);
    fd.set("toRaceId", toRaceId);
    fd.set("schoolId", schoolId);
    startTransition(async () => {
      try {
        const res = await moveSchoolEntriesAction(fd);
        if (res.error) setError(res.error);
        else setOpen(false);
      } catch {
        setError("Couldn't reach the server — try again.");
      }
    });
  }

  return (
    <div className="w-full space-y-1 rounded bg-gray-50 p-2">
      <p className="text-xs text-gray-700">
        Move {schoolName}&apos;s {entered} result{entered === 1 ? "" : "s"} to:
      </p>
      <div className="flex flex-wrap gap-1">
        <select
          value={toRaceId}
          onChange={(e) => setToRaceId(e.target.value)}
          className="min-h-[36px] flex-1 rounded border px-1 text-sm"
          aria-label="Race to move them to"
        >
          <option value="">Choose race…</option>
          {targets.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
              {t.status === "closed" ? " (finalised)" : ""}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={isPending}
          onClick={move}
          className="min-h-[36px] rounded bg-gray-800 px-3 text-sm text-white disabled:opacity-60"
        >
          {isPending ? "Moving…" : "Move"}
        </button>
        <button
          type="button"
          className="min-h-[36px] px-2 text-sm"
          onClick={() => {
            setOpen(false);
            setError(null);
          }}
        >
          Cancel
        </button>
      </div>
      {error && (
        <p role="alert" className="text-xs text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
