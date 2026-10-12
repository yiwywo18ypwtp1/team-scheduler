import type { Metadata } from "next";
import Link from "next/link";
import { BookingNotFound, BookingSummary } from "@/features/booking/components/BookingSummary";
import { getBookingForGuest, getBookingPage } from "@/server/booking";
import { getMember } from "@/server/members";

// Personal page behind a secret token: rendered per request and kept out of search engines.
export const metadata: Metadata = { title: "Booking confirmed", robots: { index: false } };

export default async function ConfirmedPage({ params, searchParams }: PageProps<"/book/[slug]/confirmed/[bookingId]">) {
  const [{ slug, bookingId }, { token }] = await Promise.all([params, searchParams]);
  const booking = typeof token === "string" ? getBookingForGuest(bookingId, token) : undefined;
  const page = getBookingPage(slug);
  if (!booking || !page || booking.slug !== slug) return <BookingNotFound />;

  const owner = getMember(page.ownerId);
  const tokenParam = `token=${encodeURIComponent(booking.cancelToken)}`;
  const isCancelled = booking.status === "cancelled";

  return (
    <main className="mx-auto flex w-full max-w-xl flex-col gap-6 px-6 py-12">
      <h1 className="text-2xl font-semibold">{isCancelled ? "This booking was cancelled" : "You're booked"}</h1>
      <BookingSummary booking={booking} page={page} owner={owner} />
      {!isCancelled && (
        <div className="flex flex-wrap gap-3 text-sm">
          <a
            href={`/api/book/${slug}/bookings/${booking.id}.ics?${tokenParam}`}
            className="rounded-md bg-zinc-900 px-4 py-2 font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
          >
            Add to calendar (.ics)
          </a>
          <Link
            href={`/book/${slug}/cancel/${booking.id}?${tokenParam}`}
            className="rounded-md border border-zinc-300 px-4 py-2 dark:border-zinc-700"
          >
            Cancel or reschedule
          </Link>
        </div>
      )}
      <p className="text-xs text-zinc-500">Keep this link: it is the only way to manage your booking.</p>
    </main>
  );
}
