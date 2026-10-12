import type { CalendarEvent } from "@/types/domain";

/**
 * Visual style by the current user's response: declined events fade out,
 * unanswered ones get a dashed border, other people's events are neutral.
 */
export function eventToneClass(event: CalendarEvent, currentUserId: string): string {
  const status = event.attendees.find((attendee) => attendee.memberId === currentUserId)?.status;
  switch (status) {
    case "declined":
      return "bg-zinc-100 text-zinc-500 line-through border-zinc-300 dark:bg-zinc-800 dark:border-zinc-700";
    case "pending":
    case "tentative":
      return "bg-white text-blue-800 border-dashed border-blue-400 dark:bg-zinc-900 dark:text-blue-200";
    case undefined:
      // Someone else's event (team view): neutral, since it isn't on the user's schedule.
      return "bg-zinc-100 text-zinc-700 border-zinc-300 dark:bg-zinc-800 dark:text-zinc-200 dark:border-zinc-700";
    default:
      return "bg-blue-100 text-blue-900 border-blue-300 dark:bg-blue-950 dark:text-blue-100 dark:border-blue-800";
  }
}
