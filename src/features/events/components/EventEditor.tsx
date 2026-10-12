import { getNow } from "@/lib/time/now";
import { parseOccurrenceId } from "@/lib/recurrence/expand";
import { getEvent } from "@/server/events";
import { listMembers } from "@/server/members";
import { listRooms } from "@/server/rooms";
import { getSession } from "@/server/session";
import { eventToFormValues, newEventFormValues, type NewEventPrefill } from "../form-values";
import { EventForm } from "./EventForm";

type Props = {
  /** Edit this event; without it, create a new one. */
  eventId?: string;
  prefill?: NewEventPrefill;
  closeHref?: string;
};

/**
 * Server Component that loads everything the form needs. Shared by the
 * intercepted modal and the full page, which only differ in their wrapper.
 */
export async function EventEditor({ eventId, prefill, closeHref }: Props) {
  const session = await getSession();
  // Only the fields the client needs.
  const members = listMembers().map(({ id, name, timezone }) => ({ id, name, timezone }));
  const rooms = listRooms();

  if (!eventId) {
    const defaultValues = newEventFormValues({
      now: getNow(),
      timeZone: session.timeZone,
      currentUserId: session.user.id,
      prefill,
    });
    return (
      <EventForm
        mode={{ kind: "create" }}
        defaultValues={defaultValues}
        members={members}
        rooms={rooms}
        closeHref={closeHref}
      />
    );
  }

  const event = getEvent(eventId);
  if (!event) {
    // Handled here instead of notFound(), so a stale link shows a message
    // inside the modal rather than replacing the whole calendar.
    return (
      <p role="alert" className="text-sm">
        This event doesn&apos;t exist anymore. It may have been deleted.
      </p>
    );
  }

  const isAttendee = event.attendees.some((attendee) => attendee.memberId === session.user.id);
  // Occurrences don't carry the rule; the editor shows the series' rule.
  const occurrence = parseOccurrenceId(event.id);
  const seriesRule = occurrence ? getEvent(occurrence.masterId)?.rrule : event.rrule;
  return (
    <EventForm
      // A new version (e.g. after saving elsewhere) resets the form to fresh values.
      key={event.version}
      mode={{ kind: "edit", eventId: event.id, version: event.version, isOccurrence: occurrence !== null }}
      defaultValues={eventToFormValues(event, seriesRule)}
      members={members}
      rooms={rooms}
      readOnly={!isAttendee}
      closeHref={closeHref}
    />
  );
}
