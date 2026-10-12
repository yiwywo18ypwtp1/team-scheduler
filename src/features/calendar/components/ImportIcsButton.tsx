"use client";

import { useRef, useTransition } from "react";
import { toast } from "sonner";
import { importEventsAction } from "@/features/events/actions";
import { parseIcs } from "@/features/events/ics-import";
import { notifyCalendarChanged } from "../sync";

type Props = { timeZone: string; userId: string };

const MAX_FILE_BYTES = 1024 * 1024;

/**
 * Imports events from an .ics file. Parsing runs in the browser (the file
 * never has to be uploaded as-is); the server re-validates every event.
 */
export function ImportIcsButton({ timeZone, userId }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isPending, startTransition] = useTransition();

  async function importFile(file: File) {
    if (file.size > MAX_FILE_BYTES) {
      toast.error("The file is larger than 1 MB");
      return;
    }
    const { events, skipped } = parseIcs(await file.text(), { timeZone, attendeeId: userId });
    if (events.length === 0) {
      toast.error("No events found in the file", { description: skipped.slice(0, 3).join("\n") || undefined });
      return;
    }
    startTransition(async () => {
      const result = await importEventsAction(events);
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      const problems = [...skipped, ...result.data.failed];
      if (result.data.created > 0) notifyCalendarChanged();
      const message = `Imported ${result.data.created} of ${events.length + skipped.length} events`;
      if (problems.length > 0) toast.warning(message, { description: problems.slice(0, 3).join("\n") });
      else toast.success(message);
    });
  }

  return (
    <>
      <button
        type="button"
        disabled={isPending}
        onClick={() => inputRef.current?.click()}
        className="rounded-md border border-zinc-300 px-3 py-1 text-sm hover:bg-zinc-100 disabled:opacity-50 print:hidden dark:border-zinc-700 dark:hover:bg-zinc-800"
      >
        {isPending ? "Importing…" : "Import .ics"}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept=".ics,text/calendar"
        aria-label="Import .ics file"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = ""; // allow picking the same file again
          if (file) void importFile(file);
        }}
      />
    </>
  );
}
