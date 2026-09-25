import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto max-w-md space-y-4 p-4">
      <h1 className="text-xl font-bold">Page not found</h1>
      <p className="text-gray-700">
        This link isn&apos;t valid — it may have been cut short when it was copied, or the results
        aren&apos;t published yet. Ask the league organiser to send it again.
      </p>
      <div className="grid grid-cols-2 gap-2">
        <Link
          href="/"
          className="flex min-h-[48px] items-center justify-center rounded-lg bg-blue-600 font-semibold text-white"
        >
          Home
        </Link>
        <Link
          href="/results"
          className="flex min-h-[48px] items-center justify-center rounded-lg border text-blue-700"
        >
          Results
        </Link>
      </div>
    </main>
  );
}
