import { Modal } from "@/components/Modal";
import { EventEditor } from "@/features/events/components/EventEditor";
import { prefillFromSearchParams } from "@/features/events/form-values";

// Intercepts /calendar/events/new during in-app navigation: shown over the calendar.
export default async function NewEventModal({ searchParams }: PageProps<"/calendar/events/new">) {
  return (
    <Modal title="New event">
      <EventEditor prefill={prefillFromSearchParams(await searchParams)} />
    </Modal>
  );
}
