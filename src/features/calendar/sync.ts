"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

const CHANNEL = "team-scheduler:calendar";

/**
 * Tells the other open tabs that calendar data changed (BroadcastChannel:
 * same browser, same origin, no server round trip). Call after a successful save.
 */
export function notifyCalendarChanged() {
  if (typeof BroadcastChannel === "undefined") return;
  const channel = new BroadcastChannel(CHANNEL);
  channel.postMessage({ type: "changed", at: Date.now() });
  channel.close();
}

/** Re-renders the current page with fresh server data when another tab changed something. */
export function CalendarSync() {
  const router = useRouter();
  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const channel = new BroadcastChannel(CHANNEL);
    channel.onmessage = () => router.refresh();
    return () => channel.close();
  }, [router]);
  return null;
}
