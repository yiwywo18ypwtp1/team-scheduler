import type { Metadata } from "next";
import { EventEditor } from "@/features/events/components/EventEditor";
import { prefillFromSearchParams } from "@/features/events/form-values";

export const metadata: Metadata = { title: "New event" };

// Direct link or reload: the same form as a full page.
export default async function NewEventPage({ searchParams }: PageProps<"/calendar/events/new">) {
  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-8">
      <h1 className="mb-6 text-2xl font-semibold">New event</h1>
      <EventEditor prefill={prefillFromSearchParams(await searchParams)} closeHref="/calendar" />
    </main>
  );
}
