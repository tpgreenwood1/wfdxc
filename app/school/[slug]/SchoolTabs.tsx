"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function SchoolTabs({ slug }: { slug: string }) {
  const pathname = usePathname();
  const base = `/school/${slug}`;
  const tabs = [
    // The race entry pages live under /race/, so they keep "Races" highlighted.
    { href: base, label: "Races", active: pathname === base || pathname.startsWith(`${base}/race/`) },
    { href: `${base}/runners`, label: "Runners", active: pathname.startsWith(`${base}/runners`) },
    { href: `${base}/results`, label: "Results", active: pathname.startsWith(`${base}/results`) },
  ];

  return (
    <nav className="sticky top-0 z-20 -mx-4 grid grid-cols-3 border-b bg-white">
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          aria-current={tab.active ? "page" : undefined}
          className={`flex min-h-[48px] items-center justify-center border-b-2 font-medium ${
            tab.active
              ? "border-blue-600 text-blue-700"
              : "border-transparent text-gray-600"
          }`}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
