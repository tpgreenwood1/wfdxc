"use server";

import { revalidatePath } from "next/cache";
import { regenerateHubToken } from "@/lib/hubTokens";
import { regenerateToken } from "@/lib/tokens";

export async function regenerateHubTokenAction(formData: FormData): Promise<void> {
  const eventId = String(formData.get("eventId"));
  const tokenId = String(formData.get("tokenId"));
  await regenerateHubToken(tokenId);
  revalidatePath(`/admin/events/${eventId}/links`);
}

export async function regenerateSubmissionTokenAction(formData: FormData): Promise<void> {
  const eventId = String(formData.get("eventId"));
  const tokenId = String(formData.get("tokenId"));
  await regenerateToken(tokenId);
  revalidatePath(`/admin/events/${eventId}/links`);
}
