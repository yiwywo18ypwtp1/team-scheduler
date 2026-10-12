"use client";

import { describeRecurrence } from "@/lib/recurrence/rule";
import type { Room } from "@/types/domain";
import type { EventFormValues } from "../schema";
import type { MemberOption } from "./MemberPicker";

type Props = {
  mine: EventFormValues;
  theirs: EventFormValues;
  members: MemberOption[];
  rooms: Room[];
  isBusy: boolean;
  onKeepMine: () => void;
  onUseTheirs: () => void;
};

/**
 * Shown on a 409: someone saved the event while this user was editing it.
 * Lists only the fields that differ, side by side, and lets the user either
 * overwrite with their own values or take the saved version and continue.
 */
export function VersionConflict({ mine, theirs, members, rooms, isBusy, onKeepMine, onUseTheirs }: Props) {
  const memberName = (id: string) => members.find((member) => member.id === id)?.name ?? id;
  const fields: [label: string, format: (values: EventFormValues) => string][] = [
    ["Title", (values) => values.title],
    [
      "Time",
      (values) =>
        values.allDay
          ? `${values.startDate} – ${values.endDate}, all day`
          : `${values.startDate} ${values.startTime} – ${values.endDate} ${values.endTime}`,
    ],
    ["Timezone", (values) => values.timezone],
    ["Repeat", (values) => describeRecurrence(values.recurrence, values.startDate)],
    ["Attendees", (values) => values.attendeeIds.map(memberName).sort().join(", ")],
    [
      "Location",
      ({ location }) =>
        location.kind === "room"
          ? `Room ${rooms.find((room) => room.id === location.roomId)?.name ?? location.roomId}`
          : location.kind === "url"
            ? location.url
            : "None",
    ],
    ["Description", (values) => values.description.trim() || "—"],
  ];
  const differences = fields.filter(([, format]) => format(mine) !== format(theirs));

  return (
    <div role="alert" className="flex flex-col gap-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-800 dark:bg-amber-950">
      <p className="font-medium">Someone else saved this event while you were editing it.</p>
      {differences.length > 0 ? (
        <table className="w-full table-fixed text-left text-xs">
          <thead>
            <tr>
              <th className="w-24 pb-1 font-medium" />
              <th className="pb-1 font-medium">Saved now</th>
              <th className="pb-1 font-medium">Your changes</th>
            </tr>
          </thead>
          <tbody>
            {differences.map(([label, format]) => (
              <tr key={label} className="align-top">
                <th scope="row" className="py-0.5 pr-2 font-medium">
                  {label}
                </th>
                <td className="py-0.5 pr-2 break-words">{format(theirs)}</td>
                <td className="py-0.5 break-words">{format(mine)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p>The saved version differs only in details this form doesn&apos;t show (e.g. attendees&apos; answers).</p>
      )}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onUseTheirs}
          disabled={isBusy}
          className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 font-medium disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900"
        >
          Use saved version
        </button>
        <button
          type="button"
          onClick={onKeepMine}
          disabled={isBusy}
          className="rounded-md bg-zinc-900 px-3 py-1.5 font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
        >
          {isBusy ? "Saving…" : "Keep my changes"}
        </button>
      </div>
    </div>
  );
}
