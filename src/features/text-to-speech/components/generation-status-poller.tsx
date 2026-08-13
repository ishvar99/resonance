"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const POLL_INTERVAL_MS = 3_000;

/**
 * Refreshes the (server-rendered) result page while a generation is queued or
 * processing. The page simply stops rendering this component once the status
 * settles, which ends the polling — no client-side state machine to keep in
 * sync with the server's.
 */
export function GenerationStatusPoller() {
  const router = useRouter();

  useEffect(() => {
    const interval = setInterval(() => router.refresh(), POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [router]);

  return null;
}
