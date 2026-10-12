import type { CalendarEvent } from "@/types/domain";

/** Minimal valid event for tests; `start`/`end` are ISO strings with offset. */
export function makeEvent(
  overrides: Partial<CalendarEvent> & Pick<CalendarEvent, "id" | "start" | "end">,
): CalendarEvent {
  return {
    title: overrides.id,
    timezone: "UTC",
    allDay: false,
    attendees: [{ memberId: "mem_01", status: "accepted" }],
    version: 1,
    ...overrides,
  };
}
