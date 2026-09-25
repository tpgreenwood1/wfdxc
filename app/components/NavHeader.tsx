import Link from "next/link";

export default function NavHeader() {
  return (
    <header className="border-b bg-gray-50">
      <nav className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-4 gap-y-1 p-3 text-sm">
        <Link className="font-semibold" href="/">
          XC League
        </Link>
        <Link className="text-blue-600 underline" href="/results">
          Results
        </Link>
        <Link className="text-blue-600 underline" href="/standings">
          Standings
        </Link>
        <Link className="text-blue-600 underline" href="/admin">
          Admin
        </Link>
      </nav>
    </header>
  );
}
