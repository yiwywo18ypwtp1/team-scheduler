import { formatInTimeZone } from "@/lib/time/zoned";
import type { CalendarEvent } from "@/types/domain";
import { isStripEvent } from "../lib/event-days";

/** "10:00 Title" in month cells; all-day and multi-day events show the title only. */
export function EventLabel({ event, timeZone }: { event: CalendarEvent; timeZone: string }) {
  if (isStripEvent(event)) return <>{event.title}</>;
  return (
    <>
      <span className="opacity-70">{formatInTimeZone(Date.parse(event.start), timeZone, "HH:mm")}</span>{" "}
      {event.title}
    </>
  );
}
