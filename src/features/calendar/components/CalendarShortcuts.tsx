"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import type { DateKey } from "@/lib/time/zoned";
import { calendarHref, type CalendarParams } from "../lib/params";

/**
 * Page-wide keys: T goes to today, N creates an event. Ignored while typing
 * or while a dialog (the event modal) is open. Keys for a focused event
 * (arrows, Enter, Delete) are handled by the event itself.
 */
export function CalendarShortcuts({ params, today }: { params: CalendarParams; today: DateKey }) {
  const router = useRouter();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
      if (document.querySelector("dialog[open]")) return;

      const key = event.key.toLowerCase();
      if (key === "t") {
        event.preventDefault();
        router.push(calendarHref({ ...params, date: today }));
      } else if (key === "n") {
        event.preventDefault();
        router.push("/calendar/events/new", { scroll: false });
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [router, params, today]);

  return (
    <p className="sr-only">
      Keyboard: T goes to today, N creates an event. On a focused event, arrow keys move it by 15 minutes or a day,
      Enter opens it, Delete deletes it.
    </p>
  );
}
