"use client";

import { useActionState } from "react";
import { saveSettings } from "../actions";

type Props = {
  members: { id: string; name: string; timezone: string }[];
  timeZones: readonly string[];
  defaultValues: { userId: string; timeZone: string };
};

// Native form + useActionState instead of React Hook Form: two selects have
// no client-side validation or dynamic fields, and the form keeps working
// before hydration (progressive enhancement).
export function SettingsForm({ members, timeZones, defaultValues }: Props) {
  const [result, formAction, isPending] = useActionState(saveSettings, null);
  const fieldErrors = result?.ok === false ? result.error.fieldErrors : undefined;

  return (
    <form action={formAction} className="flex max-w-md flex-col gap-5">
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Current user</span>
        <select
          name="userId"
          defaultValue={defaultValues.userId}
          aria-invalid={Boolean(fieldErrors?.userId)}
          aria-describedby="userId-error"
          className="rounded-md border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
        >
          {members.map((member) => (
            <option key={member.id} value={member.id}>
              {member.name} ({member.timezone})
            </option>
          ))}
        </select>
        <FieldError id="userId-error" messages={fieldErrors?.userId} />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Timezone</span>
        <select
          name="timeZone"
          defaultValue={defaultValues.timeZone}
          aria-invalid={Boolean(fieldErrors?.timeZone)}
          aria-describedby="timeZone-hint timeZone-error"
          className="rounded-md border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
        >
          <option value="">Same as the selected user</option>
          {timeZones.map((timeZone) => (
            <option key={timeZone} value={timeZone}>
              {timeZone}
            </option>
          ))}
        </select>
        <span id="timeZone-hint" className="text-xs text-zinc-500">
          Default display timezone. The calendar can still switch it via the URL.
        </span>
        <FieldError id="timeZone-error" messages={fieldErrors?.timeZone} />
      </label>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
        >
          {isPending ? "Saving…" : "Save"}
        </button>
        <p role="status" className="text-sm">
          {result?.ok === true && <span className="text-green-700 dark:text-green-400">Saved</span>}
          {result?.ok === false && !fieldErrors && (
            <span className="text-red-700 dark:text-red-400">{result.error.message}</span>
          )}
        </p>
      </div>
    </form>
  );
}

function FieldError({ id, messages }: { id: string; messages?: string[] }) {
  return (
    <span id={id} className="text-xs text-red-700 dark:text-red-400">
      {messages?.join(", ")}
    </span>
  );
}
