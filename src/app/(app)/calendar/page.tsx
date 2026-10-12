import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CalendarToolbar } from "@/features/calendar/components/CalendarToolbar";
import { MonthView } from "@/features/calendar/components/MonthView";
import { WeekView } from "@/features/calendar/components/WeekView";
import { calendarHref, parseCalendarParams } from "@/features/calendar/lib/params";
import { rangeTitle, visibleDays, visibleInterval } from "@/features/calendar/lib/range";
import { getMockNow, getNow } from "@/lib/time/now";
import { workingIntervals } from "@/lib/time/working-hours";
import { dateKeyInTimeZone } from "@/lib/time/zoned";
import { listEvents } from "@/server/events";
import { getSession } from "@/server/session";

export const metadata: Metadata = { title: "Calendar" };

/**
 * The URL is the source of truth: view, date and timezone come from search
 * params, and navigating to another week is just a new URL rendered here.
 * Events are read straight from the data layer, not via our own HTTP API.
 */
export default async function CalendarPage({ searchParams }: PageProps<"/calendar">) {
  const [session, rawParams] = await Promise.all([getSession(), searchParams]);
  const now = getNow();

  const { params, isValid } = parseCalendarParams(rawParams, { now, timeZone: session.timeZone });
  if (!isValid) redirect(calendarHref(params));

  const days = visibleDays(params.view, params.date);
  const range = visibleInterval(days, params.tz);
  const events = listEvents({ ...range, memberIds: [session.user.id] });
  const today = dateKeyInTimeZone(now, params.tz);

  return (
    <main className="mx-auto flex h-[calc(100dvh-3.25rem)] w-full max-w-7xl flex-col gap-4 px-6 py-4">
      <CalendarToolbar params={params} today={today} title={rangeTitle(params.view, params.date, days)} />
      {params.view === "week" ? (
        <WeekView
          events={events}
          days={days}
          timeZone={params.tz}
          today={today}
          currentUserId={session.user.id}
          workingHours={workingIntervals(session.user.workingHours, session.user.timezone, range)}
          mockNow={getMockNow()}
        />
      ) : (
        <MonthView
          events={events}
          days={days}
          date={params.date}
          timeZone={params.tz}
          today={today}
          currentUserId={session.user.id}
        />
      )}
    </main>
  );
}
