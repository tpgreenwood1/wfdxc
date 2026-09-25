import Link from "next/link";
import { cookies } from "next/headers";
import { LAST_SCHOOL_COOKIE } from "@/lib/schoolAccess";

const linkClass = "inline-flex min-h-[44px] items-center px-1 text-blue-600 underline";

export default function NavHeader() {
  const lastSchoolSlug = cookies().get(LAST_SCHOOL_COOKIE)?.value;

  return (
    <header className="border-b bg-gray-50 print:hidden">
      <nav className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-3 px-3 text-sm">
        <Link className={`${linkClass} font-semibold`} href="/">
          Home
        </Link>
        {lastSchoolSlug && (
          <Link className={`${linkClass} font-medium`} href={`/school/${encodeURIComponent(lastSchoolSlug)}`}>
            My school
          </Link>
        )}
        <Link className={linkClass} href="/results">
          Results
        </Link>
        <Link className={linkClass} href="/standings">
          Standings
        </Link>
        <Link className={linkClass} href="/help">
          Help
        </Link>
        {/* No prefetch: a background fetch of /admin gets the basic-auth 401 and pops the browser login prompt. */}
        <Link className={linkClass} href="/admin" prefetch={false}>
          Admin
        </Link>
      </nav>
    </header>
  );
}
