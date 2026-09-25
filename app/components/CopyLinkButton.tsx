"use client";

import { useState } from "react";

export default function CopyLinkButton({
  path,
  label = "Copy",
}: {
  path: string;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function handleClick() {
    const url = `${window.location.origin}${path}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      alert(url);
    }
  }

  return (
    <span className="inline-flex items-center gap-1">
      <a
        href={path}
        target="_blank"
        rel="noopener noreferrer"
        className="text-xs text-blue-600 underline"
      >
        Open
      </a>
      <button
        type="button"
        onClick={handleClick}
        className="rounded bg-gray-200 px-2 py-0.5 text-xs"
      >
        {copied ? "Copied!" : label}
      </button>
    </span>
  );
}
