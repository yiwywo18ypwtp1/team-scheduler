"use client";

import { useId, useState } from "react";

export type MemberOption = { id: string; name: string; timezone: string };

type Props = {
  members: MemberOption[];
  value: string[];
  onChange: (ids: string[]) => void;
  invalid?: boolean;
  describedBy?: string;
  disabled?: boolean;
};

/**
 * Multi-select with search. Filters a preloaded list on the client: with ~30
 * members that is instant, and it avoids debounced requests to
 * /api/members and the races that come with them.
 *
 * Uses a filtered list of native checkboxes rather than a custom combobox,
 * so keyboard and screen-reader support come from the browser.
 */
export function MemberPicker({ members, value, onChange, invalid, describedBy, disabled }: Props) {
  const [query, setQuery] = useState("");
  const listId = useId();

  const selected = new Set(value);
  const normalizedQuery = query.trim().toLowerCase();
  const visible = normalizedQuery
    ? members.filter((member) => member.name.toLowerCase().includes(normalizedQuery))
    : members;

  const toggle = (id: string) =>
    onChange(selected.has(id) ? value.filter((selectedId) => selectedId !== id) : [...value, id]);

  return (
    <div className="flex flex-col gap-2">
      {value.length > 0 && (
        <ul aria-label="Selected attendees" className="flex flex-wrap gap-1.5">
          {value.map((id) => {
            const member = members.find((candidate) => candidate.id === id);
            return (
              <li
                key={id}
                className="flex items-center gap-1 rounded-full bg-zinc-100 py-0.5 pl-2.5 pr-1 text-xs dark:bg-zinc-800"
              >
                {member?.name ?? `Unknown member (${id})`}
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => toggle(id)}
                  aria-label={`Remove ${member?.name ?? id}`}
                  className="flex size-4 items-center justify-center rounded-full hover:bg-zinc-300 dark:hover:bg-zinc-600"
                >
                  ×
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <input
        type="search"
        value={query}
        disabled={disabled}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search people"
        aria-label="Search people"
        aria-controls={listId}
        aria-invalid={invalid}
        aria-describedby={describedBy}
        className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm aria-[invalid=true]:border-red-500 dark:border-zinc-700 dark:bg-zinc-900"
      />

      <ul
        id={listId}
        aria-label="People"
        className="max-h-40 overflow-y-auto rounded-md border border-zinc-200 dark:border-zinc-800"
      >
        {visible.map((member) => (
          <li key={member.id}>
            <label className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800">
              <input
                type="checkbox"
                checked={selected.has(member.id)}
                disabled={disabled}
                onChange={() => toggle(member.id)}
              />
              <span className="flex-1">{member.name}</span>
              <span className="text-xs text-zinc-500">{member.timezone}</span>
            </label>
          </li>
        ))}
        {visible.length === 0 && <li className="px-3 py-2 text-sm text-zinc-500">No one found</li>}
      </ul>
    </div>
  );
}
