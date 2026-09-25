"use client";

import Link from "next/link";
import { useEffect } from "react";

/** Shown instead of Next's bare "Application error" screen. In production the real
 * message is hidden, so this explains the likely causes on race day and offers a way
 * back rather than a dead end. */
export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto max-w-md space-y-4 p-4">
      <h1 className="text-xl font-bold">Something went wrong</h1>
      <p className="text-gray-700">
        That didn&apos;t work — usually because of a patchy signal, or because the scorer has
        just finalised the race. Anything already marked as saved is safe.
      </p>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={reset}
          className="min-h-[48px] rounded-lg bg-blue-600 font-semibold text-white"
        >
          Try again
        </button>
        <button
          type="button"
          onClick={() => window.history.back()}
          className="min-h-[48px] rounded-lg border text-blue-700"
        >
          Go back
        </button>
      </div>
      <p className="text-sm">
        <Link className="text-blue-600 underline" href="/">
          Home
        </Link>
      </p>
      {error.digest && <p className="text-xs text-gray-400">Reference: {error.digest}</p>}
    </main>
  );
}
