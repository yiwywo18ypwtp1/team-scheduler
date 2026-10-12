import type { Metadata } from "next";
import { EventEditor } from "@/features/events/components/EventEditor";

export const metadata: Metadata = { title: "Event" };

// Direct link or reload: the same form as a full page.
export default async function EditEventPage({ params }: PageProps<"/calendar/events/[id]">) {
  const { id } = await params;
  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-8">
      <h1 className="mb-6 text-2xl font-semibold">Event</h1>
      <EventEditor eventId={id} closeHref="/calendar" />
    </main>
  );
}
