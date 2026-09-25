"use client";

import { usePathname } from "next/navigation";
import HelpButton from "@/app/components/HelpButton";
import type { HelpTopic } from "@/lib/help";

/** Help for whichever school tab is showing — lives in the layout header so it's on
 * every school page, including the code gate. */
export default function SchoolHelp({ slug, hasAccess }: { slug: string; hasAccess: boolean }) {
  const pathname = usePathname();
  const base = `/school/${slug}`;
  let topic: HelpTopic = "races";
  if (!hasAccess) topic = "code";
  else if (pathname.startsWith(`${base}/race/`)) topic = "entry";
  else if (pathname.startsWith(`${base}/runners`)) topic = "runners";
  else if (pathname.startsWith(`${base}/results`)) topic = "schoolResults";

  return <HelpButton topics={[topic]} />;
}
