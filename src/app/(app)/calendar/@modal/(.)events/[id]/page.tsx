import { Modal } from "@/components/Modal";
import { EventEditor } from "@/features/events/components/EventEditor";

// Intercepts /calendar/events/:id during in-app navigation: shown over the calendar.
export default async function EditEventModal({ params }: PageProps<"/calendar/events/[id]">) {
  // Occurrence ids contain "@", which arrives percent-encoded in route params.
  const id = decodeURIComponent((await params).id);
  return (
    <Modal title="Event">
      <EventEditor eventId={id} />
    </Modal>
  );
}
