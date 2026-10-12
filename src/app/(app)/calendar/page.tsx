import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AgendaView } from "@/features/calendar/components/AgendaView";
import { CalendarShortcuts } from "@/features/calendar/components/CalendarShortcuts";
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
 * params, and navigating to another period is just a new URL rendered here.
 * Events are read straight from the data layer, not via our own HTTP API.
 */
export default async function CalendarPage({ searchParams }: PageProps<"/calendar">) {
  const [session, rawParams] = await Promise.all([getSession(), searchParams]);
  const now = getNow();

  const { params, isValid } = parseCalendarParams(rawParams, { now, timeZone: session.timeZone });
  if (!isValid) redirect(calendarHref(params));

  const days = visibleDays(params.view, params.date, session.weekStartsOn);
  const range = visibleInterval(days, params.tz);
  const events = listEvents({
    ...range,
    memberIds: params.show === "mine" ? [session.user.id] : undefined,
  });
  const today = dateKeyInTimeZone(now, params.tz);

  return (
    <main className="mx-auto flex h-[calc(100dvh-3.25rem)] w-full max-w-7xl flex-col gap-4 px-6 py-4 print:h-auto print:max-w-none print:p-0">
      <CalendarToolbar params={params} today={today} title={rangeTitle(params.view, params.date, days)} />
      <CalendarShortcuts params={params} today={today} />
      {(params.view === "week" || params.view === "day") && (
        <WeekView
          events={events}
          days={days}
          view={params.view}
          show={params.show}
          timeZone={params.tz}
          today={today}
          currentUserId={session.user.id}
          workingHours={workingIntervals(session.user.workingHours, session.user.timezone, range)}
          mockNow={getMockNow()}
        />
      )}
      {params.view === "month" && (
        <MonthView
          events={events}
          days={days}
          date={params.date}
          timeZone={params.tz}
          show={params.show}
          today={today}
          currentUserId={session.user.id}
        />
      )}
      {params.view === "agenda" && (
        <AgendaView
          // A new anchor, timezone or filter starts a fresh list.
          key={`${params.date}|${params.tz}|${params.show}`}
          initialEvents={events}
          from={days[0] ?? params.date}
          to={days.at(-1) ?? params.date}
          anchor={params.date}
          today={today}
          timeZone={params.tz}
          show={params.show}
          currentUserId={session.user.id}
        />
      )}
    </main>
  );
}
