import Link from "next/link";

export default function HomePage() {
  return (
    <main className="mx-auto max-w-md p-6">
      <h1 className="text-2xl font-bold">Junior XC League</h1>
      <ul className="mt-4 space-y-2">
        <li>
          <Link className="text-blue-600 underline" href="/results">
            Race results
          </Link>
        </li>
        <li>
          <Link className="text-blue-600 underline" href="/standings">
            Season standings
          </Link>
        </li>
        <li>
          <Link className="text-blue-600 underline" href="/admin">
            Admin
          </Link>
        </li>
      </ul>
    </main>
  );
}
