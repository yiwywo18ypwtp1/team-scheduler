"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { moveEventAction } from "../actions";
import { readQueue, removeMove, useIsOnline, useQueuedMoves } from "../offline-queue";
import { notifyCalendarChanged } from "../sync";

/**
 * Shows an offline banner and sends queued moves once the browser is online
 * again. A move that the server rejects (e.g. someone changed the event
 * meanwhile, 409) is dropped with a toast; the calendar then shows the server state.
 */
export function OfflineSync() {
  const router = useRouter();
  const isOnline = useIsOnline();
  const queued = useQueuedMoves();
  const replaying = useRef(false);

  useEffect(() => {
    if (!isOnline || queued.length === 0 || replaying.current) return;
    replaying.current = true;
    void (async () => {
      let sent = 0;
      for (const move of readQueue()) {
        let result;
        try {
          result = await moveEventAction(move.id, move.version, move.start, move.end);
        } catch {
          break; // still no connection; try again on the next "online"
        }
        removeMove(move.id);
        if (result.ok) sent += 1;
        else toast.error(`Couldn't move "${move.title}" made offline: ${result.error.message}`);
      }
      replaying.current = false;
      if (sent > 0) {
        toast.success(`Synced ${sent} offline ${sent === 1 ? "change" : "changes"}`);
        notifyCalendarChanged();
      }
      router.refresh();
    })();
  }, [isOnline, queued.length, router]);

  if (isOnline && queued.length === 0) return null;
  return (
    <p role="status" className="rounded-md bg-amber-100 px-3 py-1.5 text-sm text-amber-900 print:hidden dark:bg-amber-900/40 dark:text-amber-100">
      {isOnline
        ? `Syncing ${queued.length} offline ${queued.length === 1 ? "change" : "changes"}…`
        : `You're offline. Moves are saved on this device${queued.length ? ` (${queued.length} waiting)` : ""} and sent when you reconnect.`}
    </p>
  );
}
