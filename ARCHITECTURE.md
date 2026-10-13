# Architecture

Guiding rule: idiomatic App Router, Server Components by default, a client boundary only where the browser is needed, and no abstraction without a concrete problem behind it.

## 1. Layout of the code

```
src/app/        routes only: thin pages/layouts that compose features; api/ = Route Handlers
src/features/   per area (calendar, events, find-time, booking, settings): components, zod schemas,
                Server Actions, feature-specific pure logic
src/server/     'server-only': SQLite access and domain rules (events, availability, booking, session)
src/lib/        pure, isomorphic: time/timezones, intervals, recurrence, availability, error contract
```

`server/*` exposes plain functions (`listEvents`, `updateEvent`, `createBooking`, …) over one SQLite connection; there is no repository/service layer. Presentational components never import `server/*` or call `fetch`.

## 2. Server / client split

| Part | Kind | Why |
|---|---|---|
| Calendar page, toolbar, `MonthView` | Server | URL in, HTML out; links for navigation |
| `MoreEventsPopover` ("+N more") | Client | Native Popover API; the day's full list is fetched on open, not shipped in the page |
| `WeekView`, `TimedEventBlock` | Client | Drag-n-drop and `useOptimistic`; events still come as props from the server |
| `NowLine`, `ScrollArea`, `TimeZoneSelect` | Client | Own timer / scroll position / writes tz to the URL |
| `AgendaView` | Client | `@tanstack/react-virtual` list; fetches earlier/later days from `GET /api/events` (aborted when stale) while scrolling |
| `CalendarSync`, `OfflineSync`, `ImportIcsButton`, `PrintButton` | Client | BroadcastChannel, `online`/localStorage queue, `File` parsing, `window.print()` |
| `EventEditor` (modal and page) | Server | Loads event, series rule, members, rooms |
| `Modal`, `EventForm`, `RecurrenceField`, `MemberPicker` | Client | `<dialog>`, React Hook Form |
| Find-time page + timeline / `FindTimeForm` | Server / Client | Results stream in `<Suspense>` / RHF writes criteria to the URL |
| `/book/[slug]`, OG image | Server, **static** | Same for every visitor |
| `BookingFlow`, `SlotPicker`, `QuestionFields` | Client | Guest timezone and slots depend on the browser and on "now"; questions render from data |
| `QuestionnaireBuilder` (+ `QuestionEditor`) | Client | `useFieldArray` over the Question union; settings, save bar, cards and preview each subscribe only to what they show |
| Confirmation, cancel, settings | Server (+ tiny form) | Token in the URL; plain `<form action>` works without JS |

Public booking pages live outside the `(app)` route group, so the app header (it reads cookies) doesn't make them dynamic.

## 3. Data flow

- **Reads.** Server Components call `server/*` directly, not our own HTTP API. The URL is the state; invalid params redirect to the canonical URL.
- **Writes.** Server Actions validate, call `server/*` and `revalidatePath`. Route Handlers expose the same functions over HTTP: two thin adapters, no duplicated logic.
- **Validation.** One zod schema per form for RHF, the action and the Route Handler. The booking answers schema is built at runtime from the page's questions (hidden `showIf` questions are neither validated nor kept), on the client and again on the server with the current questions; a changed questionnaire returns `QUESTIONS_CHANGED` with the new questions. Data-dependent rules (room capacity, existing members) run on the server and return `fieldErrors` by dotted path (`location.roomId`) for `setError`.
- **Errors.** Domain code throws `DomainError(code)`, adapters return `{ error: { code, message, fieldErrors?, details? } }`. Actions *return* failures, so forms, toasts and alerts show them in place; `error.tsx` is for the unexpected. A broken stored RRULE shows the event once instead of failing the page.
- **Permissions.** Only attendees may change an event: enforced in `server/events.ts` (403). The UI disables editing/dragging for others only as a hint.
- **Consistency.** Events carry `version` (occurrences share the master's); PATCH needs `If-Match`, a stale one gets 409 with the current event, and the form shows the differences. Read-check-write runs in one SQLite transaction. Bookings use `IMMEDIATE`: the write lock is taken before the slot is re-checked, so racing guests are serialized and the loser gets `SLOT_TAKEN` + alternatives. An `Idempotency-Key` (with a request hash) is stored in the same transaction, so retries and double clicks return the first booking.

## 4. Time model

- **Instants** are UTC epoch ms inside the app, ISO *with offset* at the edges (DB, API); events and members store an IANA zone. No `getHours()`-style local maths: all conversions go through `lib/time/zoned.ts`.
- **Wall time → instant** resolves DST like Temporal's `compatible`: a gap time moves forward, an ambiguous fall-back time takes the earlier instant. `TZDate`'s constructor was rejected: under the two test `TZ`s it resolved ambiguous times differently. A fast path (same offset a day before and after) skips the full resolution away from transitions.
- **Input years** are limited to 1900–2100 and repeat rules to daily…yearly, so no request can expand a series across millennia or per second.
- **Days** are `yyyy-MM-dd` keys; a day in a zone is `[local midnight, next local midnight)`, so 23/25-hour days fall out naturally. All-day events are floating dates; timed events are instants shown in the display zone.
- **Grid positions** are real elapsed minutes since local midnight: on Oct 25 in Kyiv both 03:30s are placed once, an hour apart. On 23/25-hour days that column gets its own hour labels (03:00 twice / no 03:00) and a "25 h" badge.
- **Working hours** are converted per local date in each member's zone, then everything is interval maths on UTC numbers; members 20 h apart need no special case.
- **Forms** hold wall-clock fields + timezone; instants are resolved once on save, so changing the zone keeps 10:00 as 10:00.
- **Recurrence.** Only the master stores the RRULE and `exdates`. The server expands it per range in *floating* wall-clock time and converts each occurrence with the event's zone, so a daily 03:30 event happens once on the fall-back night and moves to 04:30 in the spring gap (tested). Occurrences are virtual: `<master>@<start ms>` with `seriesId`. "This / following / all" are pure planners (`scope.ts`) applied in one transaction:
  - "this" = exdate + a separate event with `seriesId`;
  - "following" = `UNTIL` before it + a new series that takes later exdates and moved occurrences, `COUNT` recomputed; on the first occurrence it equals "all";
  - "all" = the master shifted by the same wall-clock delta.

  The form keeps a structure, serialized to RRULE on save and parsed back; rules it can't show stay "custom".
- **"Now"** is `getNow()` at server edges (honours `MOCK_NOW`), passed into pure functions; the booking page asks the server for "today". Tests run under `TZ=Pacific/Auckland` and `TZ=America/Los_Angeles` with identical results.

## 5. Caching and loading

- `/calendar`: dynamic. Prev/next links `prefetch` the neighbouring period's full RSC payload, so switching weeks is instant without a client cache. Writes call `revalidatePath`, and the fresh props replace the optimistic state.
- `/find-time`: dynamic, results streamed in `<Suspense key={query}>` (slow by spec), the form stays usable.
- `/book/[slug]`: static (`generateStaticParams`); its settings are read through `unstable_cache` tagged `booking-page:<slug>`, and `PUT /api/booking-pages/:slug` calls `revalidateTag` so the HTML is rebuilt. Slots are a client `fetch` with `no-store`: they depend on "now" and on bookings made seconds ago. Confirmation, cancel and `.ics`: dynamic, `private, no-store`.
- No React Query/SWR: server state arrives through RSC and the URL. The client fetches (booking slots; conflict warnings, debounced 400 ms; Agenda paging) abort stale requests and tag results with their query.

## 6. Performance: what was measured and how

Drag state lives in the dragged `TimedEventBlock`, not `WeekView`: `setPointerCapture` on it, preview portalled into an overlay. State changes only when the snapped 15-minute position changes (otherwise the updater returns the same object and React skips the render). `NowLine` has its own timer. No `memo`/`useMemo` was needed.

**Measurement:** `npm run measure:drag` (`scripts/measure-drag.mjs`, playwright-core driving the installed Chrome) opens a team week with **188 events**, drags one for 60 frame-paced steps and records `requestAnimationFrame` frame times, `PerformanceObserver('longtask')` and a `MutationObserver` over the grid, at normal and 4× throttled CPU.

| CPU | p95 / max frame | frames > 33 ms | long tasks | DOM elements changed during drag |
|---|---|---|---|---|
| 1× | 16.8 / 16.8 ms | 0 | 0 | 3 (dragged block, overlay, preview) |
| 4× | 16.8 / 16.8 ms | 0 | 0 | 3 |

Series expansion was profiled too: the zone-conversion fast path took a team month (1419 occurrences) from 119 ms to 18 ms.

**Team month view** (`/calendar?view=month&show=team`, ~2300 events in the grid; `curl` against `next start`, warm). Two problems were found in review. Every day's "+N more" list was rendered into the page. The month layout also converted each event to local days once per week row, through date-fns `format`. Now the popover loads its day on open, local days are computed once per event, and `dateKeyInTimeZone` uses the cached zone offset.

| | HTML | server time | of which month layout |
|---|---|---|---|
| before | 1.8 MB | 380 ms | 114 ms |
| after | 128 KB | 100 ms | 11 ms |

## 7. Decisions and rejected alternatives

| Decision | Alternative | Why not |
|---|---|---|
| Own pointer code for drag-n-drop | dnd-kit | A time grid is coordinate maths, not droppables; context updates would re-render more than the dragged block |
| URL as state + RSC (calendar, find-time) | Client state + `fetch` in effects | Shareable links and Back for free; the router keeps only the latest navigation, so no manual races |
| Server Actions for UI writes, Route Handlers as API | Client `fetch` to Route Handlers | Actions work with `useOptimistic`/`revalidatePath`; both call the same `server/*` |
| One RHF form for the two-step booking | A form per step | Answers would be lost when going back or when the slot was taken |
| RRULE expanded in floating time | `rrule`'s `tzid` / expanding in UTC | `tzid` relies on the runtime's local zone; UTC expansion shifts local times across DST |
| Virtual occurrences, only overrides stored | One row per occurrence | Unbounded series can't be stored; "all" would touch every row |
| SQLite (better-sqlite3), raw SQL | ORM / in-memory | Synchronous transactions are simple; the schema is small. In-memory first, SQLite on request |
| Native `<dialog>`/Popover, `sonner` | Radix/shadcn | Focus trap, Escape and top layer come with the platform |

Not introduced on purpose: Redux/Zustand, React Query, repositories/services, generic API clients, a UI kit, `useMemo`/`useCallback` by default.

## 8. Known limitations

The form can't edit custom RRULEs created elsewhere (it can only replace them); "all" doesn't touch occurrences edited one by one. The offline queue covers moves only, and there is no service worker. See README.md.
