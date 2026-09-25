"use client";

import Link from "next/link";
import { useRef } from "react";
import { HELP_GUIDES, type HelpTopic } from "@/lib/help";
import HelpGuideView from "./HelpGuideView";

/**
 * A "? Help" button that opens this page's how-to guide(s) in a panel — a sheet from
 * the bottom on phones, a centred dialog on wider screens. Uses the native <dialog>,
 * so Esc and the back gesture close it without extra code.
 */
export default function HelpButton({
  topics,
  className = "",
}: {
  topics: HelpTopic[];
  className?: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const close = () => dialogRef.current?.close();

  return (
    <>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        className={`inline-flex min-h-[44px] shrink-0 items-center gap-1 rounded-full border border-blue-600 px-3 text-sm font-medium text-blue-700 print:hidden ${className}`}
      >
        <span
          aria-hidden
          className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white"
        >
          ?
        </span>
        Help
      </button>
      <dialog
        ref={dialogRef}
        aria-label={HELP_GUIDES[topics[0]].title}
        // Tapping the dim backdrop (the dialog element itself, outside the panel) closes it.
        onClick={(e) => e.target === e.currentTarget && close()}
        className="m-0 mt-auto max-h-[85vh] w-full max-w-none overflow-y-auto rounded-t-2xl p-0 backdrop:bg-black/40 sm:m-auto sm:max-w-md sm:rounded-2xl"
      >
        <div className="space-y-5 p-4 pb-6">
          <div className="flex justify-end">
            <button
              type="button"
              onClick={close}
              className="min-h-[44px] rounded-lg px-4 font-medium text-blue-700 ring-1 ring-gray-300"
            >
              Close
            </button>
          </div>
          {topics.map((topic) => (
            <HelpGuideView key={topic} guide={HELP_GUIDES[topic]} />
          ))}
          <p className="border-t pt-3 text-sm">
            <Link href="/help" className="text-blue-600 underline" onClick={close}>
              See all guides
            </Link>
          </p>
        </div>
      </dialog>
    </>
  );
}
