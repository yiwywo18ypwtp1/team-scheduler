import type { Metadata } from "next";
import Link from "next/link";
import { cancelBookingAction } from "@/features/booking/actions";
import { BookingNotFound, BookingSummary } from "@/features/booking/components/BookingSummary";
import { getBookingForGuest, getBookingPage } from "@/server/booking";
import { getMember } from "@/server/members";

export const metadata: Metadata = { title: "Cancel booking", robots: { index: false } };

/**
 * Cancelling is a plain <form> posting to a Server Action, so it works without
 * JavaScript. Rescheduling = cancel here, then book a new time.
 */
export default async function CancelPage({ params, searchParams }: PageProps<"/book/[slug]/cancel/[bookingId]">) {
  const [{ slug, bookingId }, { token, error }] = await Promise.all([params, searchParams]);
  const booking = typeof token === "string" ? getBookingForGuest(bookingId, token) : undefined;
  const page = getBookingPage(slug);
  if (!booking || !page || booking.slug !== slug) return <BookingNotFound />;

  const owner = getMember(page.ownerId);
  const isCancelled = booking.status === "cancelled";

  return (
    <main className="mx-auto flex w-full max-w-xl flex-col gap-6 px-6 py-12">
      <h1 className="text-2xl font-semibold">{isCancelled ? "Booking cancelled" : "Cancel this booking?"}</h1>
      <BookingSummary booking={booking} page={page} owner={owner} />

      {typeof error === "string" && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">
          {error}
        </p>
      )}

      {isCancelled ? (
        <Link href={`/book/${slug}`} className="text-sm font-medium underline">
          Book a new time
        </Link>
      ) : (
        <form action={cancelBookingAction} className="flex flex-wrap items-center gap-3">
          <input type="hidden" name="slug" value={slug} />
          <input type="hidden" name="id" value={booking.id} />
          <input type="hidden" name="token" value={booking.cancelToken} />
          <button type="submit" className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white">
            Cancel booking
          </button>
          <span className="text-sm text-zinc-500">To reschedule, cancel and then pick a new time.</span>
        </form>
      )}
    </main>
  );
}
