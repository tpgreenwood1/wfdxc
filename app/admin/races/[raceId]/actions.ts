"use server";

import { revalidatePath } from "next/cache";
import {
  applyPositionSteps,
  clearPositionAck,
  findRunnerResultInRace,
  setPositionAck,
  setRaceStatus,
  updateResultInline,
} from "@/lib/races";
import { deleteResult, moveSchoolEntries, upsertResult } from "@/lib/results";
import { publishRace, republishIfClosed } from "@/lib/publish";
import { quickAddRunner } from "@/lib/runners";
import { regenerateToken } from "@/lib/tokens";
import { setConfirmedState, type ConfirmedState } from "@/lib/raceSchoolStatus";
import { isValidPosition, MAX_POSITION, ordinal } from "@/lib/raceIssues";
import { parseSteps } from "@/lib/positionOps";
import type { RaceStatus } from "@/lib/types";

/** Client-called race actions return an error message instead of throwing: Next
 * hides thrown messages in production, and the table needs to roll back its
 * optimistic update and tell the admin what went wrong. */
export type ActionResult = { error?: string };

function parsePosition(raw: FormDataEntryValue | null): number | null {
  const n = Number(raw);
  return isValidPosition(n) ? n : null;
}

const BAD_PLACE = `Place must be a whole number from 1 to ${MAX_POSITION}.`;

/** Everything that shows this race's results: admin views, the public page and — when
 * a finalised race is republished — season standings. */
function revalidateRace(raceId: string, republished = false) {
  revalidatePath(`/admin/races/${raceId}`);
  revalidatePath("/admin/events/[eventId]", "page");
  revalidatePath("/admin");
  revalidatePath(`/results/${raceId}`);
  if (republished) {
    revalidatePath("/results");
    revalidatePath("/standings");
  }
}

async function afterResultChange(raceId: string) {
  const republished = await republishIfClosed(raceId);
  revalidateRace(raceId, republished);
}

export async function setStatusAction(formData: FormData): Promise<void> {
  const raceId = String(formData.get("raceId"));
  const status = String(formData.get("status")) as RaceStatus;
  if (!["open", "closed", "cancelled"].includes(status)) throw new Error("Invalid status");
  await setRaceStatus(raceId, status);
  revalidateRace(raceId, true);
}

export async function republishAction(formData: FormData): Promise<void> {
  const raceId = String(formData.get("raceId"));
  await publishRace(raceId);
  revalidateRace(raceId, true);
}

export async function updateResultAction(formData: FormData): Promise<ActionResult> {
  const raceId = String(formData.get("raceId"));
  const resultId = String(formData.get("resultId"));
  const positionRaw = formData.get("position");
  const runnerIdRaw = formData.get("runnerId");
  const schoolIdRaw = formData.get("schoolId");

  const updates: { position?: number; runnerId?: string; schoolId?: string } = {};
  if (positionRaw !== null) {
    const position = parsePosition(positionRaw);
    if (position === null) return { error: BAD_PLACE };
    updates.position = position;
  }
  if (runnerIdRaw) {
    const runnerId = String(runnerIdRaw);
    const existing = await findRunnerResultInRace(raceId, runnerId);
    if (existing && existing.id !== resultId) {
      return {
        error: `That runner already has ${ordinal(existing.position)} place in this race — delete or change that result first.`,
      };
    }
    updates.runnerId = runnerId;
  }
  if (schoolIdRaw) updates.schoolId = String(schoolIdRaw);

  try {
    await updateResultInline(resultId, updates);
    await afterResultChange(raceId);
    return {};
  } catch (err) {
    console.error(err);
    return { error: "Couldn't save that change — please try again." };
  }
}

/** Drag/drop and undo on the race table: moves, swaps, insert-and-shift, close-up. */
export async function movePositionsAction(formData: FormData): Promise<ActionResult> {
  const raceId = String(formData.get("raceId"));
  let steps;
  try {
    steps = parseSteps(JSON.parse(String(formData.get("steps"))));
  } catch {
    steps = null;
  }
  if (!steps) return { error: "Invalid move." };

  try {
    const result = await applyPositionSteps(raceId, steps);
    if (result.error) return result;
    await afterResultChange(raceId);
    return {};
  } catch (err) {
    console.error(err);
    return { error: "Couldn't save that move — please try again." };
  }
}

export async function addResultAction(
  formData: FormData
): Promise<ActionResult & { id?: string }> {
  const raceId = String(formData.get("raceId"));
  const runnerId = String(formData.get("runnerId"));
  const schoolId = String(formData.get("schoolId"));
  const position = parsePosition(formData.get("position"));
  if (position === null) return { error: BAD_PLACE };

  const existing = await findRunnerResultInRace(raceId, runnerId);
  if (existing) {
    return {
      error: `That runner is already in this race at ${ordinal(existing.position)} — change their place on that row instead.`,
    };
  }

  try {
    const row = await upsertResult({ raceId, runnerId, schoolId, position, submittedBy: "admin" });
    await afterResultChange(raceId);
    return { id: row.id };
  } catch (err) {
    console.error(err);
    return { error: "Couldn't add that result — please try again." };
  }
}

/** Creates a runner who isn't in the system yet (e.g. a new kid who turned up on
 * race day) so they can immediately be slotted into a result — used by the admin
 * race table's runner picker alongside searching for an existing runner. */
export async function createRunnerAction(
  formData: FormData
): Promise<{ id: string; name: string; schoolId: string; schoolName: string }> {
  const raceId = String(formData.get("raceId"));
  const name = String(formData.get("name"));
  const schoolId = String(formData.get("schoolId"));
  if (!name.trim()) throw new Error("Name can't be empty");
  if (!schoolId) throw new Error("School is required");

  const runner = await quickAddRunner(schoolId, name);
  revalidatePath(`/admin/races/${raceId}`);
  return runner;
}

export async function deleteResultAction(formData: FormData): Promise<ActionResult> {
  const raceId = String(formData.get("raceId"));
  const resultId = String(formData.get("resultId"));
  try {
    await deleteResult(resultId);
    await afterResultChange(raceId);
    return {};
  } catch (err) {
    console.error(err);
    return { error: "Couldn't delete that result — please try again." };
  }
}

/** Accept a flagged place: kind 'tie' = both runners keep it; 'gap' = nobody from a
 * league school finished there. `clear=1` undoes it. */
export async function ackPositionAction(formData: FormData): Promise<ActionResult> {
  const raceId = String(formData.get("raceId"));
  const position = parsePosition(formData.get("position"));
  const kind = String(formData.get("kind"));
  const note = String(formData.get("note") ?? "").trim() || null;
  if (position === null || (kind !== "tie" && kind !== "gap")) return { error: "Invalid place." };

  if (formData.get("clear")) {
    await clearPositionAck(raceId, position, kind);
  } else {
    await setPositionAck(raceId, position, kind, note);
  }
  revalidateRace(raceId);
  return {};
}

/** Admin override of a school's "done" / "no runners" confirmation for this race
 * (e.g. the teacher told the scorer in person). Empty state clears it. */
export async function setSchoolStateAction(formData: FormData): Promise<void> {
  const raceId = String(formData.get("raceId"));
  const schoolId = String(formData.get("schoolId"));
  const state = String(formData.get("state") ?? "");
  await setConfirmedState(
    raceId,
    schoolId,
    state === "done" || state === "no_runners" ? (state as ConfirmedState) : null,
    "admin"
  );
  revalidateRace(raceId);
}

export async function regenerateTokenAction(formData: FormData): Promise<void> {
  const raceId = String(formData.get("raceId"));
  const tokenId = String(formData.get("tokenId"));
  await regenerateToken(tokenId);
  revalidatePath(`/admin/races/${raceId}`);
}

/** Results typed into the wrong race: moves all of one school's entries from this race
 * to another race in the same event, then republishes whichever of the two is
 * finalised. */
export async function moveSchoolEntriesAction(formData: FormData): Promise<ActionResult> {
  const raceId = String(formData.get("raceId"));
  const toRaceId = String(formData.get("toRaceId") ?? "");
  const schoolId = String(formData.get("schoolId"));
  if (!toRaceId) return { error: "Pick the race to move them to." };
  try {
    await moveSchoolEntries({ fromRaceId: raceId, toRaceId, schoolId });
  } catch (err) {
    console.error(err);
    return { error: err instanceof Error ? err.message : "Couldn't move those results." };
  }
  const [a, b] = await Promise.all([republishIfClosed(raceId), republishIfClosed(toRaceId)]);
  revalidateRace(raceId, a || b);
  revalidateRace(toRaceId, a || b);
  return {};
}
