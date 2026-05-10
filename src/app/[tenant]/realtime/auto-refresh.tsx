"use client";

/**
 * Reload the realtime page every 30s so the "Now" line and live indicators
 * stay current. Disabled on historical views (other dates).
 */

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function RealtimeAutoRefresh({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!enabled) return;
    const t = setInterval(() => router.refresh(), 30_000);
    return () => clearInterval(t);
  }, [enabled, router]);
  return null;
}
