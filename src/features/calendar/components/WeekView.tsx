import type { Interval } from "@/lib/intervals";
import { formatDateKey, formatInTimeZone, type DateKey } from "@/lib/time/zoned";
import type { CalendarEvent } from "@/types/domain";
import { buildWeekLayout, type TimedSegment } from "../lib/week-layout";
import { eventToneClass } from "./event-style";
import { HOUR_HEIGHT_PX, MIN_EVENT_HEIGHT_PX, MINUTE_HEIGHT_PX } from "./grid-constants";
import { NowLine } from "./NowLine";
import { ScrollArea } from "./ScrollArea";

type Props = {
  events: CalendarEvent[];
  days: DateKey[];
  timeZone: string;
  today: DateKey;
  currentUserId: string;
  workingHours: Interval[];
  mockNow?: number;
};

const GRID_COLUMNS = "grid grid-cols-[3.5rem_repeat(7,minmax(0,1fr))]";
const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

/**
 * Server Component for now: rendering is a pure function of props.
 * It turns into a Client Component when drag-n-drop arrives (phase 5).
 */
export function WeekView({ events, days, timeZone, today, currentUserId, workingHours, mockNow }: Props) {
  const layout = buildWeekLayout({ events, days, timeZone, workingHours });

  return (
    <div
      role="grid"
      aria-readonly
      aria-label={`Week of ${formatDateKey(days[0] ?? today, "MMMM d, yyyy")}`}
      className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800"
    >
      <div role="row" className={`${GRID_COLUMNS} border-b border-zinc-200 dark:border-zinc-800`}>
        {/* Stays in the grid flow; only the label is visually hidden. */}
        <div role="columnheader">
          <span className="sr-only">Time</span>
        </div>
        {days.map((date) => {
          const isToday = date === today;
          return (
            <div
              key={date}
              role="columnheader"
              aria-current={isToday ? "date" : undefined}
              className="flex flex-col items-center py-2 text-xs"
            >
              <span className="text-zinc-500">{formatDateKey(date, "EEE")}</span>
              <span
                className={`mt-0.5 flex size-8 items-center justify-center rounded-full text-base ${
                  isToday ? "bg-blue-600 font-semibold text-white" : ""
                }`}
              >
                {formatDateKey(date, "d")}
              </span>
            </div>
          );
        })}
      </div>

      {layout.stripLaneCount > 0 && (
        <div role="row" className={`${GRID_COLUMNS} border-b border-zinc-200 dark:border-zinc-800`}>
          <div role="rowheader" className="self-center pr-2 text-right text-[11px] text-zinc-500">
            All day
          </div>
          <div
            role="gridcell"
            className="col-span-7 grid grid-cols-7 gap-y-0.5 py-1"
            style={{ gridTemplateRows: `repeat(${layout.stripLaneCount}, 1.375rem)` }}
          >
            {layout.strip.map((bar) => (
              <div
                key={bar.event.id}
                className={`mx-0.5 truncate rounded border px-1.5 text-xs leading-5 ${eventToneClass(bar.event, currentUserId)}`}
                style={{ gridColumn: `${bar.startIndex + 1} / ${bar.endIndex + 1}`, gridRow: bar.lane + 1 }}
                title={bar.event.title}
              >
                {bar.event.title}
              </div>
            ))}
          </div>
        </div>
      )}

      <ScrollArea initialScrollTop={7 * HOUR_HEIGHT_PX} className="min-h-0 flex-1 overflow-y-auto">
        <div role="row" className={GRID_COLUMNS}>
          <div aria-hidden className="relative">
            {HOURS.slice(1).map((hour) => (
              <span
                key={hour}
                className="absolute right-2 -translate-y-1/2 text-[11px] text-zinc-500"
                style={{ top: hour * HOUR_HEIGHT_PX }}
              >
                {String(hour).padStart(2, "0")}:00
              </span>
            ))}
          </div>

          {layout.days.map((day) => (
            <div
              key={day.date}
              role="gridcell"
              aria-label={formatDateKey(day.date, "EEEE, MMMM d")}
              className="relative border-l border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/60"
              style={{ height: day.minutes * MINUTE_HEIGHT_PX }}
            >
              {day.workingBlocks.map((block) => (
                <div
                  key={block.startMinute}
                  aria-hidden
                  className="absolute inset-x-0 bg-white dark:bg-zinc-950"
                  style={{
                    top: block.startMinute * MINUTE_HEIGHT_PX,
                    height: (block.endMinute - block.startMinute) * MINUTE_HEIGHT_PX,
                  }}
                />
              ))}
              <div
                aria-hidden
                className="absolute inset-0 text-zinc-200 dark:text-zinc-800"
                style={{
                  backgroundImage: `repeating-linear-gradient(to bottom, currentColor 0 1px, transparent 1px ${HOUR_HEIGHT_PX}px)`,
                }}
              />
              {day.segments.map((segment) => (
                <EventBlock
                  key={segment.event.id}
                  segment={segment}
                  timeZone={timeZone}
                  currentUserId={currentUserId}
                />
              ))}
              <NowLine dayStart={day.interval.start} dayEnd={day.interval.end} mockNow={mockNow} />
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

function EventBlock({
  segment,
  timeZone,
  currentUserId,
}: {
  segment: TimedSegment;
  timeZone: string;
  currentUserId: string;
}) {
  const { event, startMinute, endMinute, column, columnCount } = segment;
  const timeRange = `${formatInTimeZone(Date.parse(event.start), timeZone, "HH:mm")}–${formatInTimeZone(Date.parse(event.end), timeZone, "HH:mm")}`;
  const height = Math.max((endMinute - startMinute) * MINUTE_HEIGHT_PX, MIN_EVENT_HEIGHT_PX);

  return (
    <div
      aria-label={`${event.title}, ${timeRange}`}
      className={`absolute z-10 overflow-hidden rounded border px-1.5 py-0.5 text-xs leading-tight ${eventToneClass(event, currentUserId)} ${
        segment.continuesBefore ? "rounded-t-none" : ""
      } ${segment.continuesAfter ? "rounded-b-none" : ""}`}
      style={{
        top: startMinute * MINUTE_HEIGHT_PX,
        height,
        left: `calc(${(column / columnCount) * 100}% + 1px)`,
        width: `calc(${100 / columnCount}% - 2px)`,
      }}
    >
      <div className="truncate font-medium">{event.title}</div>
      {height > 2 * MIN_EVENT_HEIGHT_PX && <div className="truncate opacity-80">{timeRange}</div>}
    </div>
  );
}
