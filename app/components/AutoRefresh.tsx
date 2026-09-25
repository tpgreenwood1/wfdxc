"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * Re-fetches the current server page every `intervalMs` while it's on screen, so the
 * scorer sees teachers' entries arrive without reloading. Also refreshes straight
 * away when the phone is unlocked / tab re-focused or the signal comes back. Pass
 * `paused` while the admin is mid-edit so fresh data can't jump the list under them.
 */
export default function AutoRefresh({
  intervalMs = 20_000,
  paused = false,
}: {
  intervalMs?: number;
  paused?: boolean;
}) {
  const router = useRouter();
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  useEffect(() => {
    if (paused) return;
    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      router.refresh();
      setLastRefresh(new Date());
    };
    const id = setInterval(refresh, intervalMs);
    const onVisible = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", refresh);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", refresh);
    };
  }, [paused, intervalMs, router]);

  return (
    <p className="text-xs text-gray-500" aria-live="off">
      {paused
        ? "Auto-update paused while you edit"
        : `Updates automatically${
            lastRefresh
              ? ` · last ${lastRefresh.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`
              : ""
          }`}
    </p>
  );
}
