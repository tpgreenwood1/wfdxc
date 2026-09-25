"use client";

import { useState } from "react";

/**
 * Sends a ready-written message containing a link: opens the phone's share sheet
 * (WhatsApp, text, email…) where available, otherwise copies the whole message so it
 * can be pasted. `message` may contain `{url}`, replaced with the absolute link;
 * without it the link is appended on its own line.
 */
export default function ShareLinkButton({
  path,
  message,
  title,
  label = "Share",
  className = "min-h-[40px] rounded bg-blue-600 px-3 text-sm text-white",
}: {
  path: string;
  message: string;
  title?: string;
  label?: string;
  className?: string;
}) {
  const [status, setStatus] = useState<string | null>(null);

  async function handleClick() {
    const url = `${window.location.origin}${path}`;
    const text = message.includes("{url}") ? message.replace("{url}", url) : `${message}\n${url}`;

    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title, text });
        return;
      } catch (err) {
        // User closed the share sheet — nothing to do.
        if (err instanceof DOMException && err.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(text);
      setStatus("Message copied");
      setTimeout(() => setStatus(null), 2000);
    } catch {
      window.prompt("Copy this message:", text);
    }
  }

  return (
    <button type="button" onClick={handleClick} className={className}>
      {status ?? label}
    </button>
  );
}
