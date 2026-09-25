"use client";

import { useState } from "react";

/** A search box over server-rendered rows — filters by each item's `text`. */
export default function FilterableList({
  items,
  placeholder,
  className = "divide-y rounded border",
}: {
  items: { key: string; text: string; node: React.ReactNode }[];
  placeholder: string;
  className?: string;
}) {
  const [q, setQ] = useState("");
  const query = q.trim().toLowerCase();
  const shown = query ? items.filter((i) => i.text.toLowerCase().includes(query)) : items;

  return (
    <div className="space-y-2">
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={placeholder}
        className="min-h-[44px] w-full rounded border px-3"
      />
      <ul className={className}>
        {shown.map((i) => (
          <li key={i.key}>{i.node}</li>
        ))}
      </ul>
      {shown.length === 0 && <p className="text-sm text-gray-500">Nothing matches &ldquo;{q}&rdquo;.</p>}
    </div>
  );
}
