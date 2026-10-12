"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useMemo, useState, type ReactNode } from "react";
import {
  get,
  useController,
  useForm,
  useFormState,
  useWatch,
  type Control,
  type FieldPath,
} from "react-hook-form";
import { toast } from "sonner";
import type { ApiError } from "@/lib/errors";
import { recurrenceToRRule } from "@/lib/recurrence/rule";
import { SERIES_SCOPES, type SeriesScope } from "@/lib/recurrence/scope";
import { TIME_ZONE_OPTIONS } from "@/lib/time/time-zones";
import type { Room } from "@/types/domain";
import { createEventAction, deleteEventAction, updateEventAction } from "../actions";
import { makeEventFormSchema, type EventFormValues } from "../schema";
import { MemberPicker, type MemberOption } from "./MemberPicker";
import { RecurrenceField } from "./RecurrenceField";

type Props = {
  mode:
    | { kind: "create" }
    /** `isOccurrence`: one occurrence of a series, so saving asks for a scope. */
    | { kind: "edit"; eventId: string; version: number; isOccurrence: boolean };
  defaultValues: EventFormValues;
  members: MemberOption[];
  rooms: Room[];
  /** Server decided the user may not edit; the server checks again on save. */
  readOnly?: boolean;
  /** Full-page mode: where to go after save/cancel. In a modal we go back instead. */
  closeHref?: string;
};

/** Saving or deleting an occurrence waits for the user to pick a scope. */
type PendingSeriesAction = { kind: "save"; values: EventFormValues } | { kind: "delete" };

const SCOPE_LABELS: Record<SeriesScope, string> = {
  this: "This event",
  following: "This and following events",
  all: "All events",
};

const inputClass =
  "w-full rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm aria-[invalid=true]:border-red-500 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900";

export function EventForm({ mode, defaultValues, members, rooms, readOnly = false, closeHref }: Props) {
  const router = useRouter();
  // The capacity rule depends on `rooms`; build the resolver once per rooms
  // list instead of a new schema on every render.
  const resolver = useMemo(() => zodResolver(makeEventFormSchema(rooms)), [rooms]);
  const { register, control, handleSubmit, setError, getValues, setValue, formState } =
    useForm<EventFormValues>({ resolver, defaultValues });
  const [formError, setFormError] = useState<string | null>(null);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [pending, setPending] = useState<PendingSeriesAction | null>(null);
  const [scope, setScope] = useState<SeriesScope>("this");
  const [isWorking, setIsWorking] = useState(false);

  const isOccurrence = mode.kind === "edit" && mode.isOccurrence;
  const close = () => (closeHref ? router.push(closeHref) : router.back());

  const showServerError = (error: ApiError) => {
    let hasFieldErrors = false;
    for (const [path, messages] of Object.entries(error.fieldErrors ?? {})) {
      // Paths come from the same schema, so they match the form's field names.
      setError(path as FieldPath<EventFormValues>, { type: "server", message: messages[0] });
      hasFieldErrors = true;
    }
    setFormError(hasFieldErrors ? null : error.message);
  };

  // A changed repeat rule can't apply to a single occurrence. Both rules are
  // serialized with the original date, so moving the date alone isn't a change.
  const ruleChanged = (values: EventFormValues) =>
    recurrenceToRRule(values.recurrence, defaultValues.startDate) !==
    recurrenceToRRule(defaultValues.recurrence, defaultValues.startDate);

  const save = async (values: EventFormValues, chosenScope?: SeriesScope) => {
    setIsWorking(true);
    const result =
      mode.kind === "edit"
        ? await updateEventAction(mode.eventId, mode.version, values, chosenScope)
        : await createEventAction(values);
    setIsWorking(false);
    setPending(null);

    if (!result.ok) return showServerError(result.error);
    toast.success(mode.kind === "edit" ? "Event updated" : "Event created");
    close();
  };

  const remove = async (chosenScope?: SeriesScope) => {
    if (mode.kind !== "edit") return;
    setIsWorking(true);
    const result = await deleteEventAction(mode.eventId, mode.version, chosenScope);
    setIsWorking(false);
    setPending(null);
    if (!result.ok) return showServerError(result.error);
    toast.success("Event deleted");
    close();
  };

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    if (isOccurrence) {
      setScope(ruleChanged(values) ? "following" : "this");
      setPending({ kind: "save", values });
      return;
    }
    await save(values);
  });

  const isBusy = formState.isSubmitting || isWorking;

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      {readOnly && (
        <p className="rounded-md bg-zinc-100 px-3 py-2 text-sm dark:bg-zinc-800">
          You are not an attendee of this event, so you can only view it.
        </p>
      )}

      {/* A disabled fieldset disables every control inside it. */}
      <fieldset disabled={readOnly || isBusy || pending !== null} className="flex flex-col gap-4">
        <Field label="Title" control={control} name="title">
          {(aria) => <input {...aria} autoFocus {...register("title")} className={inputClass} />}
        </Field>

        <TimeFields control={control} register={register} getValues={getValues} setValue={setValue} />

        <Field label="Timezone" control={control} name="timezone">
          {(aria) => (
            <select {...aria} {...register("timezone")} className={inputClass}>
              {withCurrent(TIME_ZONE_OPTIONS, defaultValues.timezone).map((timeZone) => (
                <option key={timeZone} value={timeZone}>
                  {timeZone}
                </option>
              ))}
            </select>
          )}
        </Field>

        <RecurrenceField control={control} register={register} />
        <AttendeesField control={control} members={members} />
        <LocationField control={control} register={register} setValue={setValue} rooms={rooms} />

        <Field label="Description" control={control} name="description">
          {(aria) => <textarea {...aria} rows={3} {...register("description")} className={inputClass} />}
        </Field>
      </fieldset>

      {formError && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">
          {formError}
        </p>
      )}

      {pending ? (
        <div className="flex flex-col gap-3 rounded-md border border-zinc-300 p-3 dark:border-zinc-700">
          <fieldset className="flex flex-col gap-1.5 text-sm">
            <legend className="mb-1 font-medium">
              {pending.kind === "save" ? "Save changes to a recurring event" : "Delete a recurring event"}
            </legend>
            {SERIES_SCOPES.map((option) => {
              const unavailable = pending.kind === "save" && option === "this" && ruleChanged(pending.values);
              return (
                <label key={option} className={`flex items-center gap-2 ${unavailable ? "opacity-50" : ""}`}>
                  <input
                    type="radio"
                    name="scope"
                    value={option}
                    checked={scope === option}
                    disabled={unavailable}
                    onChange={() => setScope(option)}
                  />
                  {SCOPE_LABELS[option]}
                  {unavailable && <span className="text-xs text-zinc-500">(the repeat rule changed)</span>}
                </label>
              );
            })}
          </fieldset>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setPending(null)} disabled={isWorking} className="rounded-md px-3 py-1.5 text-sm">
              Back
            </button>
            <button
              type="button"
              autoFocus
              disabled={isWorking}
              onClick={() => (pending.kind === "save" ? save(pending.values, scope) : remove(scope))}
              className={`rounded-md px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50 ${
                pending.kind === "save" ? "bg-zinc-900 dark:bg-zinc-100 dark:text-zinc-900" : "bg-red-600"
              }`}
            >
              {isWorking ? "Working…" : pending.kind === "save" ? "Save" : "Delete"}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          {mode.kind === "edit" && !readOnly && (
            <div className="mr-auto flex items-center gap-2">
              {isConfirmingDelete ? (
                <>
                  <button
                    type="button"
                    onClick={() => remove()}
                    disabled={isBusy}
                    className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                  >
                    {isWorking ? "Deleting…" : "Confirm delete"}
                  </button>
                  <button type="button" onClick={() => setIsConfirmingDelete(false)} className="text-sm">
                    Keep
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    if (!isOccurrence) return setIsConfirmingDelete(true);
                    setScope("this");
                    setPending({ kind: "delete" });
                  }}
                  disabled={isBusy}
                  className="rounded-md px-3 py-1.5 text-sm text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950"
                >
                  Delete
                </button>
              )}
            </div>
          )}
          <button
            type="button"
            onClick={close}
            className="ml-auto rounded-md px-3 py-1.5 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            {readOnly ? "Close" : "Cancel"}
          </button>
          {!readOnly && (
            <button
              type="submit"
              disabled={isBusy}
              className="rounded-md bg-zinc-900 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
            >
              {isBusy ? "Saving…" : "Save"}
            </button>
          )}
        </div>
      )}
    </form>
  );
}

// ---------------------------------------------------------------------------
// Field building blocks. Each subscribes only to the state it shows
// (useWatch / useFormState / useController), so typing in one field
// doesn't re-render the whole form.
// ---------------------------------------------------------------------------

type FormControl = Control<EventFormValues>;
type FormMethods = ReturnType<typeof useForm<EventFormValues>>;

function withCurrent(options: readonly string[], current: string): readonly string[] {
  return options.includes(current) ? options : [current, ...options];
}

function errorId(name: string) {
  return `${name.replace(".", "-")}-error`;
}

type AriaProps = { id: string; "aria-invalid"?: true; "aria-describedby"?: string };

/**
 * Label + control + error message. The control is a render prop that receives
 * id/aria attributes, because only Field knows the field's current error
 * (it subscribes to that one field via useFormState).
 */
function Field({
  label,
  control,
  name,
  children,
}: {
  label: string;
  control: FormControl;
  name: FieldPath<EventFormValues>;
  children: (aria: AriaProps) => ReactNode;
}) {
  const { errors } = useFormState({ control, name });
  const message: string | undefined = get(errors, name)?.message;
  const id = name.replace(".", "-");

  return (
    <div className="flex flex-1 flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      {children({
        id,
        "aria-invalid": message ? true : undefined,
        "aria-describedby": message ? errorId(name) : undefined,
      })}
      {message && (
        <span id={errorId(name)} className="text-xs text-red-700 dark:text-red-400">
          {message}
        </span>
      )}
    </div>
  );
}

function TimeFields({
  control,
  register,
  getValues,
  setValue,
}: {
  control: FormControl;
  register: FormMethods["register"];
  getValues: FormMethods["getValues"];
  setValue: FormMethods["setValue"];
}) {
  const allDay = useWatch({ control, name: "allDay" });

  return (
    <div className="flex flex-col gap-3">
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" {...register("allDay")} />
        All day
      </label>
      <div className="flex flex-wrap gap-3">
        <Field label="Start" control={control} name="startDate">
          {(aria) => (
            <input
              {...aria}
              type="date"
              {...register("startDate", {
                // Keep the end from falling before a moved start date.
                onChange: (event) => {
                  if (getValues("endDate") < event.target.value) {
                    setValue("endDate", event.target.value, { shouldDirty: true });
                  }
                },
              })}
              className={inputClass}
            />
          )}
        </Field>
        {!allDay && (
          <Field label="Start time" control={control} name="startTime">
            {(aria) => <input {...aria} type="time" step={900} {...register("startTime")} className={inputClass} />}
          </Field>
        )}
        <Field label={allDay ? "End date" : "End"} control={control} name="endDate">
          {(aria) => <input {...aria} type="date" {...register("endDate")} className={inputClass} />}
        </Field>
        {!allDay && (
          <Field label="End time" control={control} name="endTime">
            {(aria) => <input {...aria} type="time" step={900} {...register("endTime")} className={inputClass} />}
          </Field>
        )}
      </div>
    </div>
  );
}

function AttendeesField({ control, members }: { control: FormControl; members: MemberOption[] }) {
  const { field, fieldState } = useController({ control, name: "attendeeIds" });
  return (
    <div className="flex flex-col gap-1">
      <span className="text-sm font-medium">Attendees</span>
      <MemberPicker
        members={members}
        value={field.value}
        onChange={field.onChange}
        invalid={Boolean(fieldState.error)}
        describedBy={fieldState.error ? errorId("attendeeIds") : undefined}
      />
      {fieldState.error && (
        <span id={errorId("attendeeIds")} className="text-xs text-red-700 dark:text-red-400">
          {fieldState.error.message}
        </span>
      )}
    </div>
  );
}

function LocationField({
  control,
  register,
  setValue,
  rooms,
}: {
  control: FormControl;
  register: FormMethods["register"];
  setValue: FormMethods["setValue"];
  rooms: Room[];
}) {
  const kind = useWatch({ control, name: "location.kind" });

  // Switching the kind replaces the whole object, so no stale `roomId`
  // or `url` from the previous kind is left in the form values.
  const changeKind = (next: EventFormValues["location"]["kind"]) => {
    const location: EventFormValues["location"] =
      next === "room" ? { kind: "room", roomId: "" } : next === "url" ? { kind: "url", url: "" } : { kind: "none" };
    setValue("location", location, { shouldDirty: true });
  };

  return (
    <div className="flex flex-wrap gap-3">
      <div className="flex flex-col gap-1">
        <label htmlFor="location-kind" className="text-sm font-medium">
          Location
        </label>
        <select
          id="location-kind"
          value={kind}
          onChange={(event) => changeKind(event.target.value as EventFormValues["location"]["kind"])}
          className={inputClass}
        >
          <option value="none">None</option>
          <option value="room">Meeting room</option>
          <option value="url">Video link</option>
        </select>
      </div>

      {kind === "room" && (
        <Field label="Room" control={control} name="location.roomId">
          {(aria) => (
            <select {...aria} {...register("location.roomId")} className={inputClass}>
              <option value="">Choose a room</option>
              {rooms.map((room) => (
                <option key={room.id} value={room.id}>
                  {room.name} ({room.capacity} seats)
                </option>
              ))}
            </select>
          )}
        </Field>
      )}
      {kind === "url" && (
        <Field label="Link" control={control} name="location.url">
          {(aria) => (
            <input {...aria} type="url" placeholder="https://" {...register("location.url")} className={inputClass} />
          )}
        </Field>
      )}
    </div>
  );
}
