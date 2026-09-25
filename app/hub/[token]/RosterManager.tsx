"use client";

import { useState, useTransition } from "react";
import type { RosterRunner } from "@/lib/results";
import {
  addRosterRunnerAction,
  reactivateRosterRunnerAction,
  renameRosterRunnerAction,
  retireRosterRunnerAction,
} from "./actions";

export default function RosterManager({
  token,
  initialRoster,
}: {
  token: string;
  initialRoster: RosterRunner[];
}) {
  const [roster, setRoster] = useState(initialRoster);
  const [newName, setNewName] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleAdd() {
    const name = newName.trim();
    if (!name) return;
    const exactMatch = roster.find(
      (r) => r.name.trim().toLowerCase() === name.toLowerCase()
    );
    if (exactMatch) {
      const proceed = confirm(
        `There's already a "${exactMatch.name}" on your roster. Add "${name}" as a new, different runner anyway?`
      );
      if (!proceed) return;
    }
    setMessage(null);
    startTransition(async () => {
      try {
        const created = await addRosterRunnerAction(token, name);
        setRoster((prev) =>
          [
            ...prev,
            { id: created.id, name: created.name, duplicateIndex: 1, duplicateCount: 1, isRetired: false },
          ].sort(
            (a, b) => a.name.localeCompare(b.name)
          )
        );
        setNewName("");
      } catch (err) {
        setMessage(err instanceof Error ? err.message : "Couldn't add runner.");
      }
    });
  }

  function saveRename(runnerId: string, newValue: string) {
    const trimmed = newValue.trim();
    setRenamingId(null);
    if (!trimmed) return;
    setRoster((prev) =>
      prev.map((r) => (r.id === runnerId ? { ...r, name: trimmed } : r))
    );
    startTransition(async () => {
      try {
        await renameRosterRunnerAction(token, runnerId, trimmed);
      } catch (err) {
        setMessage(err instanceof Error ? err.message : "Rename failed.");
      }
    });
  }

  function handleRetire(runner: RosterRunner) {
    if (
      !confirm(
        `Retire "${runner.name}"? They'll be hidden from your entry forms and search, but all their past results stay exactly as they are. You can reactivate them later if needed.`
      )
    ) {
      return;
    }
    setMessage(null);
    setRoster((prev) =>
      prev.map((r) => (r.id === runner.id ? { ...r, isRetired: true } : r))
    );
    startTransition(async () => {
      try {
        await retireRosterRunnerAction(token, runner.id);
      } catch (err) {
        setMessage(err instanceof Error ? err.message : "Couldn't retire runner.");
      }
    });
  }

  function handleReactivate(runner: RosterRunner) {
    setMessage(null);
    setRoster((prev) =>
      prev.map((r) => (r.id === runner.id ? { ...r, isRetired: false } : r))
    );
    startTransition(async () => {
      try {
        await reactivateRosterRunnerAction(token, runner.id);
      } catch (err) {
        setMessage(err instanceof Error ? err.message : "Couldn't reactivate runner.");
      }
    });
  }

  return (
    <div className="space-y-2">
      <p className="text-sm text-gray-600">
        Add your runners here ahead of race day so they're ready to pick from when you
        enter results.
      </p>

      <div className="flex items-center gap-2">
        <input
          type="text"
          placeholder="New runner's name…"
          className="flex-1 rounded border px-2 py-1 text-sm"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
        />
        <button
          type="button"
          className="rounded bg-blue-600 px-3 py-1 text-sm text-white disabled:opacity-50"
          disabled={isPending || !newName.trim()}
          onClick={handleAdd}
        >
          Add
        </button>
      </div>
      {message && <p className="text-xs text-red-600">{message}</p>}

      {roster.length > 0 && (
        <ul className="divide-y rounded border text-sm">
          {roster.map((r) => (
            <li
              key={r.id}
              className={`flex items-center gap-2 px-2 py-1 ${r.isRetired ? "opacity-50" : ""}`}
            >
              {renamingId === r.id ? (
                <input
                  type="text"
                  autoFocus
                  defaultValue={r.name}
                  className="flex-1 rounded border px-1"
                  onBlur={(e) => saveRename(r.id, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveRename(r.id, (e.target as HTMLInputElement).value);
                    if (e.key === "Escape") setRenamingId(null);
                  }}
                />
              ) : (
                <span className="flex-1 truncate">
                  {r.name}
                  {r.duplicateCount > 1 && (
                    <span className="ml-1 text-xs text-gray-500">({r.duplicateIndex})</span>
                  )}
                  {r.isRetired && (
                    <span className="ml-1 rounded bg-gray-200 px-1 text-xs text-gray-600">
                      retired
                    </span>
                  )}
                </span>
              )}
              {renamingId !== r.id && (
                <>
                  <button
                    type="button"
                    className="text-xs text-blue-600 underline"
                    onClick={() => setRenamingId(r.id)}
                    title="Fix a misspelled name"
                  >
                    rename
                  </button>
                  {r.isRetired ? (
                    <button
                      type="button"
                      className="text-xs text-blue-600 underline"
                      onClick={() => handleReactivate(r)}
                    >
                      reactivate
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="text-xs text-red-600 underline"
                      onClick={() => handleRetire(r)}
                      title="They've graduated / left — hide them without deleting past results"
                    >
                      retire
                    </button>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
