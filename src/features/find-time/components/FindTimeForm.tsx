"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Controller, useForm } from "react-hook-form";
import { MemberPicker, type MemberOption } from "@/features/events/components/MemberPicker";
import { TIME_ZONE_OPTIONS } from "@/lib/time/time-zones";
import type { Room } from "@/types/domain";
import { DURATION_OPTIONS, findTimeSchema, findTimeSearchParams, type FindTimeQuery } from "../schema";

type Props = {
  defaultValues: FindTimeQuery;
  members: MemberOption[];
  rooms: Room[];
};

const inputClass =
  "w-full rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm aria-[invalid=true]:border-red-500 dark:border-zinc-700 dark:bg-zinc-900";

function formatDuration(minutes: number) {
  return minutes < 60 ? `${minutes} min` : `${minutes / 60} h`;
}

/**
 * Search criteria. Submitting writes them to the URL; the page (a Server
 * Component) reads the URL and computes the windows. So results are
 * shareable, Back works, and the router keeps only the latest navigation:
 * no manual request cancellation is needed.
 *
 * A small form, so it reads `errors` directly instead of per-field
 * subscriptions like the event form.
 */
export function FindTimeForm({ defaultValues, members, rooms }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<FindTimeQuery>({
    resolver: zodResolver(findTimeSchema),
    defaultValues: { ...defaultValues, roomId: defaultValues.roomId ?? "" },
  });

  const onSubmit = handleSubmit((values) => {
    startTransition(() => router.push(`/find-time?${findTimeSearchParams(values)}`));
  });

  const timeZones = (TIME_ZONE_OPTIONS as readonly string[]).includes(defaultValues.tz)
    ? TIME_ZONE_OPTIONS
    : [defaultValues.tz, ...TIME_ZONE_OPTIONS];

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4 md:grid-cols-[1fr_1fr]">
      <div className="flex flex-col gap-1 md:row-span-3">
        <span className="text-sm font-medium">People</span>
        <Controller
          control={control}
          name="memberIds"
          render={({ field, fieldState }) => (
            <MemberPicker
              members={members}
              value={field.value}
              onChange={field.onChange}
              invalid={Boolean(fieldState.error)}
              describedBy="memberIds-error"
            />
          )}
        />
        <ErrorText id="memberIds-error" message={errors.memberIds?.message} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">From</span>
          <input type="date" {...register("from")} aria-invalid={Boolean(errors.from)} className={inputClass} />
          <ErrorText message={errors.from?.message} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">To</span>
          <input type="date" {...register("to")} aria-invalid={Boolean(errors.to)} className={inputClass} />
          <ErrorText message={errors.to?.message} />
        </label>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Duration</span>
          <select {...register("duration", { valueAsNumber: true })} className={inputClass}>
            {DURATION_OPTIONS.map((minutes) => (
              <option key={minutes} value={minutes}>
                {formatDuration(minutes)}
              </option>
            ))}
          </select>
          <ErrorText message={errors.duration?.message} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Room</span>
          <select {...register("roomId")} aria-invalid={Boolean(errors.roomId)} className={inputClass}>
            <option value="">No room needed</option>
            {rooms.map((room) => (
              <option key={room.id} value={room.id}>
                {room.name} ({room.capacity} seats)
              </option>
            ))}
          </select>
          <ErrorText message={errors.roomId?.message} />
        </label>
      </div>

      <div className="flex items-end gap-3">
        <label className="flex flex-1 flex-col gap-1 text-sm">
          <span className="font-medium">Show times in</span>
          <select {...register("tz")} className={inputClass}>
            {timeZones.map((timeZone) => (
              <option key={timeZone} value={timeZone}>
                {timeZone}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          disabled={isPending}
          className="rounded-md bg-zinc-900 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
        >
          {isPending ? "Searching…" : "Find times"}
        </button>
      </div>
    </form>
  );
}

function ErrorText({ id, message }: { id?: string; message?: string }) {
  if (!message) return null;
  return (
    <span id={id} className="text-xs text-red-700 dark:text-red-400">
      {message}
    </span>
  );
}
