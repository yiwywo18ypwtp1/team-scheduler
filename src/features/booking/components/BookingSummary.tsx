import { Fragment } from "react";
import { formatInTimeZone } from "@/lib/time/zoned";
import { formatAnswer } from "../answers";
import type { Booking, BookingPage, Member } from "@/types/domain";

function formatRange(start: number, end: number, timeZone: string) {
  return `${formatInTimeZone(start, timeZone, "EEEE, MMMM d, yyyy · HH:mm")}–${formatInTimeZone(end, timeZone, "HH:mm")}`;
}

/** Booking details for the guest: their own timezone first, the host's for reference. */
export function BookingSummary({ booking, page, owner }: { booking: Booking; page: BookingPage; owner?: Member }) {
  const start = Date.parse(booking.start);
  const end = Date.parse(booking.end);
  return (
    <dl className="grid grid-cols-[8rem_1fr] gap-x-4 gap-y-2 rounded-lg border border-zinc-200 p-4 text-sm dark:border-zinc-800">
      <dt className="text-zinc-500">What</dt>
      <dd>
        {page.title}
        {owner ? ` with ${owner.name}` : ""}
      </dd>
      <dt className="text-zinc-500">When</dt>
      <dd>
        {formatRange(start, end, booking.guestTimeZone)}
        <span className="block text-xs text-zinc-500">{booking.guestTimeZone}</span>
        {owner && owner.timezone !== booking.guestTimeZone && (
          <span className="block text-xs text-zinc-500">
            Host&apos;s time: {formatRange(start, end, owner.timezone)} ({owner.timezone})
          </span>
        )}
      </dd>
      {page.questions
        .filter((question) => booking.answers[question.id] !== undefined)
        .map((question) => (
          <Fragment key={question.id}>
            <dt className="text-zinc-500">{question.label}</dt>
            <dd className="whitespace-pre-wrap">{formatAnswer(booking.answers[question.id]!)}</dd>
          </Fragment>
        ))}
    </dl>
  );
}

export function BookingNotFound() {
  return (
    <main className="mx-auto w-full max-w-xl px-6 py-12">
      <h1 className="mb-2 text-2xl font-semibold">Booking not found</h1>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        The link may be incomplete. Please use the exact link from your confirmation.
      </p>
    </main>
  );
}
