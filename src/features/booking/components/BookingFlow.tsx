"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { useForm, useWatch, type FieldPath } from "react-hook-form";
import type { ErrorDetails } from "@/lib/errors";
import { canonicalTimeZone, TIME_ZONE_OPTIONS } from "@/lib/time/time-zones";
import { formatInTimeZone, parseIsoWithOffset } from "@/lib/time/zoned";
import { createBookingAction } from "../actions";
import { bookingRequestSchema, type BookingRequest } from "../schema";
import { SlotPicker } from "./SlotPicker";

type Props = { slug: string; durationOptions: number[] };

const subscribeToNothing = () => () => {};
const getBrowserTimeZone = () => canonicalTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
// The static HTML can't know the guest's timezone: render a placeholder on the
// server and the real form after hydration, without a mismatch.
const getNoTimeZoneOnServer = () => null;

export function BookingFlow(props: Props) {
  const detectedTimeZone = useSyncExternalStore(subscribeToNothing, getBrowserTimeZone, getNoTimeZoneOnServer);
  if (!detectedTimeZone) return <p className="text-sm text-zinc-500">Loading available times…</p>;
  return <BookingForm {...props} initialTimeZone={detectedTimeZone} />;
}

const inputClass =
  "w-full rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm aria-[invalid=true]:border-red-500 dark:border-zinc-700 dark:bg-zinc-900";

/**
 * Two steps over ONE form: the slot, timezone, duration and answers are all
 * fields of the same React Hook Form. Going back to pick another time, or
 * being sent back because the slot was taken, never loses the answers.
 */
function BookingForm({ slug, durationOptions, initialTimeZone }: Props & { initialTimeZone: string }) {
  const router = useRouter();
  const {
    register,
    control,
    handleSubmit,
    setValue,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<BookingRequest>({
    resolver: zodResolver(bookingRequestSchema),
    defaultValues: {
      start: "",
      duration: durationOptions[0],
      guestTimeZone: initialTimeZone,
      answers: { name: "", email: "", notes: "" },
    },
  });
  const [timeZone, duration, start] = useWatch({ control, name: ["guestTimeZone", "duration", "start"] });

  const [step, setStep] = useState<"slot" | "details">("slot");
  const [alternatives, setAlternatives] = useState<ErrorDetails["alternatives"]>();
  const [slotsVersion, setSlotsVersion] = useState(0);
  const [formError, setFormError] = useState<string | null>(null);
  // Stays true while navigating to the confirmation, so the button can't be pressed twice.
  const [isBooked, setIsBooked] = useState(false);
  // One Idempotency-Key per distinct request: a double click or a retry after
  // a timeout sends the same key (the server returns the first booking);
  // changing the slot or answers makes a new request with a new key.
  const [lastAttempt, setLastAttempt] = useState<{ payload: string; key: string } | null>(null);

  const chooseSlot = (slotStart: string) => {
    setValue("start", slotStart, { shouldValidate: true });
    setAlternatives(undefined);
    setStep("details");
  };

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    const payload = JSON.stringify(values);
    const key = lastAttempt?.payload === payload ? lastAttempt.key : crypto.randomUUID();
    setLastAttempt({ payload, key });
    const result = await createBookingAction(slug, values, key);

    if (result.ok) {
      setIsBooked(true);
      router.push(`/book/${slug}/confirmed/${result.data.id}?token=${encodeURIComponent(result.data.token)}`);
      return;
    }
    if (result.error.code === "SLOT_TAKEN") {
      // Keep the answers, drop the taken time, offer the nearest free ones.
      setValue("start", "");
      setAlternatives(result.error.details?.alternatives ?? []);
      setSlotsVersion((version) => version + 1);
      return;
    }
    for (const [path, messages] of Object.entries(result.error.fieldErrors ?? {})) {
      setError(path as FieldPath<BookingRequest>, { type: "server", message: messages[0] });
    }
    if (!result.error.fieldErrors) setFormError(result.error.message);
  });

  const startInstant = parseIsoWithOffset(start);
  const timeZones = (TIME_ZONE_OPTIONS as readonly string[]).includes(initialTimeZone)
    ? TIME_ZONE_OPTIONS
    : [initialTimeZone, ...TIME_ZONE_OPTIONS];

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Duration</span>
          <select
            {...register("duration", {
              valueAsNumber: true,
              // A slot found for one duration may not fit another.
              onChange: () => setValue("start", ""),
            })}
            className={inputClass}
          >
            {durationOptions.map((minutes) => (
              <option key={minutes} value={minutes}>
                {minutes} min
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Your timezone</span>
          <select {...register("guestTimeZone")} className={inputClass}>
            {timeZones.map((zone) => (
              <option key={zone} value={zone}>
                {zone}
              </option>
            ))}
          </select>
        </label>
      </div>

      {step === "slot" ? (
        <SlotPicker
          slug={slug}
          timeZone={timeZone}
          duration={duration}
          selected={start}
          onSelect={chooseSlot}
          refreshKey={slotsVersion}
        />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between rounded-md bg-zinc-100 px-3 py-2 text-sm dark:bg-zinc-800">
            <span>
              {startInstant !== undefined
                ? `${formatInTimeZone(startInstant, timeZone, "EEEE, MMMM d · HH:mm")}–${formatInTimeZone(
                    startInstant + duration * 60_000,
                    timeZone,
                    "HH:mm",
                  )} (${timeZone})`
                : "No time selected"}
            </span>
            <button type="button" onClick={() => setStep("slot")} className="font-medium underline">
              Change
            </button>
          </div>

          {alternatives && (
            <div role="alert" className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-800 dark:bg-amber-950">
              <p className="font-medium">Sorry, someone just booked that time.</p>
              {alternatives.length > 0 ? (
                <>
                  <p className="mt-1">Your answers are kept. Pick one of the nearest free times:</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {alternatives.map((alternative) => (
                      <button
                        key={alternative.start}
                        type="button"
                        onClick={() => chooseSlot(alternative.start)}
                        className="rounded-md border border-blue-300 bg-white px-2 py-1 text-blue-800 dark:bg-zinc-900 dark:text-blue-200"
                      >
                        {formatInTimeZone(Date.parse(alternative.start), timeZone, "EEE, MMM d HH:mm")}
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <p className="mt-1">There are no other free times soon. Please choose another week.</p>
              )}
            </div>
          )}
          {errors.start && <p className="text-sm text-red-700 dark:text-red-400">{errors.start.message}</p>}

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Name</span>
            <input {...register("answers.name")} autoComplete="name" aria-invalid={Boolean(errors.answers?.name)} className={inputClass} />
            {errors.answers?.name && <span className="text-xs text-red-700 dark:text-red-400">{errors.answers.name.message}</span>}
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Email</span>
            <input type="email" {...register("answers.email")} autoComplete="email" aria-invalid={Boolean(errors.answers?.email)} className={inputClass} />
            {errors.answers?.email && <span className="text-xs text-red-700 dark:text-red-400">{errors.answers.email.message}</span>}
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">What would you like to discuss? (optional)</span>
            <textarea rows={3} {...register("answers.notes")} aria-invalid={Boolean(errors.answers?.notes)} className={inputClass} />
            {errors.answers?.notes && <span className="text-xs text-red-700 dark:text-red-400">{errors.answers.notes.message}</span>}
          </label>

          {formError && (
            <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">
              {formError}
            </p>
          )}

          <button
            type="submit"
            disabled={isSubmitting || isBooked || !start}
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
          >
            {isSubmitting || isBooked ? "Booking…" : "Book"}
          </button>
        </div>
      )}
    </form>
  );
}
