import type { Metadata } from "next";
import { Suspense } from "react";
import { AvailabilityResults } from "@/features/find-time/components/AvailabilityResults";
import { FindTimeForm } from "@/features/find-time/components/FindTimeForm";
import {
  findTimeInputFromSearchParams,
  findTimeSchema,
  findTimeSearchParams,
  type FindTimeQuery,
} from "@/features/find-time/schema";
import { getNow } from "@/lib/time/now";
import { addDaysToDateKey, dateKeyInTimeZone } from "@/lib/time/zoned";
import { listMembers } from "@/server/members";
import { listRooms } from "@/server/rooms";
import { getSession } from "@/server/session";

export const metadata: Metadata = { title: "Find time" };

/**
 * The search lives in the URL. Without `members` the page shows just the form
 * with defaults; with a valid query it also streams the results.
 */
export default async function FindTimePage({ searchParams }: PageProps<"/find-time">) {
  const [session, raw] = await Promise.all([getSession(), searchParams]);
  const members = listMembers().map(({ id, name, timezone }) => ({ id, name, timezone }));
  const rooms = listRooms();

  const today = dateKeyInTimeZone(getNow(), session.timeZone);
  const defaults: FindTimeQuery = {
    memberIds: [session.user.id],
    from: today,
    to: addDaysToDateKey(today, 6),
    tz: session.timeZone,
    duration: 60,
  };

  const parsed = raw.members === undefined ? undefined : findTimeSchema.safeParse(findTimeInputFromSearchParams(raw));
  const query = parsed?.success ? parsed.data : undefined;
  const queryKey = query ? findTimeSearchParams(query) : "defaults";

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-6">
      <h1 className="text-2xl font-semibold">Find a time</h1>

      {/* Keyed by the query, so Back/Forward shows the matching criteria. */}
      <FindTimeForm key={queryKey} defaultValues={query ?? defaults} members={members} rooms={rooms} />

      {parsed && !parsed.success && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          This link has invalid search criteria: {parsed.error.issues.map((issue) => issue.message).join("; ")}.
        </p>
      )}

      {query && (
        // A new key per search shows the fallback again instead of stale results.
        <Suspense key={queryKey} fallback={<p className="text-sm text-zinc-500">Looking for common free time…</p>}>
          <AvailabilityResults query={query} />
        </Suspense>
      )}
    </main>
  );
}
