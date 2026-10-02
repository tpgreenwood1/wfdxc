import { revalidatePath } from "next/cache";
import { republishIfClosed } from "@/lib/publish";

/** Everything that shows this race's results: admin views, the public page and — when
 * a finalised race is republished — season standings. */
export function revalidateRace(raceId: string, republished = false) {
  revalidatePath(`/admin/races/${raceId}`, "layout");
  revalidatePath("/admin/events/[eventId]", "page");
  revalidatePath("/admin");
  revalidatePath(`/results/${raceId}`);
  if (republished) {
    revalidatePath("/results");
    revalidatePath("/standings");
  }
}

export async function afterResultChange(raceId: string) {
  const republished = await republishIfClosed(raceId);
  revalidateRace(raceId, republished);
}
