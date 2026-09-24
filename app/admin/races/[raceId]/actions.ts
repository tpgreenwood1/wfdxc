"use server";

import { revalidatePath } from "next/cache";
import { setRaceStatus, updateResultInline } from "@/lib/races";
import { publishRace } from "@/lib/publish";
import { regenerateToken } from "@/lib/tokens";
import type { RaceStatus } from "@/lib/types";

export async function setStatusAction(formData: FormData): Promise<void> {
  const raceId = String(formData.get("raceId"));
  const status = String(formData.get("status")) as RaceStatus;
  await setRaceStatus(raceId, status);
  revalidatePath(`/admin/races/${raceId}`);
  revalidatePath(`/results/${raceId}`);
}

export async function republishAction(formData: FormData): Promise<void> {
  const raceId = String(formData.get("raceId"));
  await publishRace(raceId);
  revalidatePath(`/admin/races/${raceId}`);
  revalidatePath(`/results/${raceId}`);
  revalidatePath("/standings");
}

export async function updateResultAction(formData: FormData): Promise<void> {
  const raceId = String(formData.get("raceId"));
  const resultId = String(formData.get("resultId"));
  const position = Number(formData.get("position"));
  if (!Number.isFinite(position)) throw new Error("Invalid position");
  await updateResultInline(resultId, { position });
  revalidatePath(`/admin/races/${raceId}`);
}

export async function regenerateTokenAction(formData: FormData): Promise<void> {
  const raceId = String(formData.get("raceId"));
  const tokenId = String(formData.get("tokenId"));
  await regenerateToken(tokenId);
  revalidatePath(`/admin/races/${raceId}`);
}
