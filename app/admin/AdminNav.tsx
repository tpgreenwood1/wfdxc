"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/admin", label: "Today", match: (p: string) => p === "/admin" },
  {
    href: "/admin/events",
    label: "Events",
    // Race pages belong to an event, so they keep "Events" highlighted.
    match: (p: string) => p.startsWith("/admin/events") || p.startsWith("/admin/races"),
  },
  { href: "/admin/schools", label: "Schools", match: (p: string) => p.startsWith("/admin/schools") },
  {
    href: "/admin/runners",
    label: "Runners",
    match: (p: string) => p.startsWith("/admin/runners") || p.startsWith("/admin/roster"),
  },
  { href: "/admin/setup", label: "Setup", match: (p: string) => p.startsWith("/admin/setup") },
];

export default function AdminNav() {
  const pathname = usePathname();
  return (
    <nav className="sticky top-0 z-20 border-b bg-white print:hidden">
      <div className="mx-auto flex max-w-5xl overflow-x-auto px-2">
        {TABS.map((tab) => {
          const active = tab.match(pathname);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className={`flex min-h-[48px] shrink-0 items-center border-b-2 px-4 font-medium ${
                active ? "border-blue-600 text-blue-700" : "border-transparent text-gray-600"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
