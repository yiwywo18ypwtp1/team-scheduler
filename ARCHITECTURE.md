# Architecture

Guiding rule: idiomatic App Router, Server Components by default, a client boundary only where the browser is needed, and no abstraction without a concrete problem behind it.

## 1. Layout of the code

```
src/app/        routes only: thin pages/layouts that compose features; api/ = Route Handlers
src/features/   one folder per area (calendar, events, find-time, booking, settings):
                components, zod schemas, Server Actions, feature-specific pure logic
src/server/     'server-only': SQLite access and domain rules (events, availability, booking, session)
src/lib/        pure, isomorphic: time/timezones, intervals, availability maths, error contract
```

`server/*` exposes plain functions (`listEvents`, `updateEvent`, `createBooking`, …) over one SQLite connection; there is no repository/service layer. Presentational components never import `server/*` or call `fetch`.

## 2. Server / client split

| Part | Kind | Why |
|---|---|---|
| Calendar page, toolbar, view/period links | Server | URL in, HTML out. Navigation is plain `<Link>` |
| `MonthView` incl. "+N more" | Server | Native Popover API, no JS |
| `WeekView` | Client | Drag-n-drop and `useOptimistic`; still gets events as props from the server |
| `TimedEventBlock` | Client | Owns the drag state of one event |
| `NowLine`, `ScrollArea`, `TimeZoneSelect` | Client | Timer / scroll position / writes the tz to the URL |
| Event modal & page (`EventEditor`) | Server | Loads event, members, rooms |
| `Modal`, `EventForm`, `MemberPicker` | Client | `<dialog>`, React Hook Form |
| Find-time page + results timeline | Server | Results stream inside `<Suspense>`, pure markup |
| `FindTimeForm` | Client | RHF, writes criteria to the URL |
| `/book/[slug]` page, OG image | Server, **static** | Settings baked in at build time |
| `BookingFlow`, `SlotPicker` | Client | Guest timezone and slots depend on the browser and on "now" |
| Confirmation / cancel pages | Server, dynamic | Secret token in the URL; cancel is a plain `<form action>` |
| Settings | Server + small client form | `useActionState`, works without JS |

Public booking pages live outside the `(app)` route group, so the app header (which reads cookies) doesn't make them dynamic.

## 3. Data flow

- **Reads.** Server Components call `server/*` directly, not our own HTTP API (no extra hop, typed results). The URL is the state: `/calendar?view&date&tz`, `/find-time?members&…`. Invalid params redirect to the canonical URL, so the address bar never disagrees with the page.
- **Writes.** Server Actions (`createEventAction`, `moveEventAction`, `createBookingAction`, …) validate, call `server/*`, `revalidatePath`. Route Handlers expose the same functions over HTTP, so there is no duplicated logic, only two thin adapters.
- **Validation.** One zod schema per form, shared by RHF (`zodResolver`), the Server Action and the Route Handler. Rules needing data (room capacity, existing members) run on the server and come back as `fieldErrors` keyed by dotted path (`location.roomId`), which the form maps with `setError`.
- **Errors.** Domain code throws `DomainError(code)`; adapters turn it into `{ error: { code, message, fieldErrors?, details? } }`. Actions *return* failures instead of throwing, so forms, toasts and inline alerts handle them; `error.tsx` is left for the unexpected. Non-existent event, deleted member, taken slot and invalid links are all shown in place.
- **Permissions.** Only attendees may change an event: enforced in `server/events.ts` (403). The UI disables editing/dragging for others, but that is a hint, not protection.
- **Consistency.** Events carry `version`. PATCH requires `If-Match`, and actions send the version; a stale one gets 409. Read-check-write runs in one SQLite transaction. Bookings use an `IMMEDIATE` transaction: the write lock is taken before the slot is re-checked, so two guests racing for one slot are serialized, and the loser gets `SLOT_TAKEN` with nearest alternatives.

## 4. Time model

- **Instants** are UTC epoch ms inside the app and ISO strings *with offset* at the edges (DB, API). Events and members store an IANA timezone. `getHours()`-style local maths is not used; all conversions go through `lib/time/zoned.ts`.
- **Wall time → instant** (`wallTimeToInstant`) resolves DST explicitly like Temporal's `compatible`: a time in a spring-forward gap moves forward, an ambiguous fall-back time takes the earlier instant. `TZDate`'s constructor was rejected: running the suite under both `TZ` values showed it resolves ambiguous times differently depending on the process timezone.
- **Calendar days** are `yyyy-MM-dd` keys; date arithmetic happens on a UTC-anchored `TZDate`. A day in a zone is `[local midnight, next local midnight)`, so 23 h and 25 h days fall out naturally.
- **All-day events** are floating dates ("Oct 14" stays Oct 14 in any display zone); timed events are instants converted to the display zone.
- **Grid positions** are real elapsed minutes since local midnight, so on Oct 25 in Kyiv both 03:30s are placed once, an hour apart (tested). Core limitation: hour labels assume 24 h; DST days get a "25 h"/"23 h" badge.
- **Working hours** are wall-clock rules converted per local date in each member's own zone; then everything is interval maths on UTC numbers (`merge`, `subtract`, `intersect`). Members 20 hours apart need no special case.
- **Forms** hold wall-clock fields + timezone (the way people describe a meeting); instants are resolved once on save. Changing the timezone keeps 10:00 as 10:00.
- **"Now"** comes from `getNow()` at server edges (honours `MOCK_NOW`) and is passed into pure functions. The booking page asks the server for "today", not the browser clock.
- Tests run under `TZ=Pacific/Auckland` and `TZ=America/Los_Angeles` (`npm run test:tz`) with identical results.

## 5. Caching and loading

| What | Strategy | Why |
|---|---|---|
| `/calendar` | Dynamic per request; prev/next links `prefetch` the neighbouring period's full RSC payload | Data depends on user and URL; switching weeks feels instant without a client cache |
| Calendar writes | `revalidatePath('/calendar')` in the action; fresh props replace optimistic state | One source of truth |
| `/find-time` results | Dynamic, streamed in `<Suspense key={query}>` | Slow by spec (300–1200 ms); the form stays usable |
| `/book/[slug]` | Static (`generateStaticParams`) | Public and identical for everyone |
| Booking slots | Client `fetch`, `Cache-Control: no-store` | Depend on "now" and on bookings made seconds ago |
| Confirmation/cancel/`.ics` | Dynamic, `private, no-store` | Per-guest, token-protected |

No React Query/SWR: server state arrives through RSC and the URL, and there is exactly one client fetch (slots), handled with `AbortController` and result keys.

## 6. Performance: what was measured and how

The drag requirement ("only the dragged element and preview re-render") shaped the design:

- Drag state lives in the dragged `TimedEventBlock`, not in `WeekView`. Pointer events are captured on that element (`setPointerCapture`); the preview is portalled into an overlay above the columns.
- State changes only when the snapped 15-minute position changes. For the other `pointermove`s the updater returns the same object, so React skips the render.
- `NowLine` has its own timer, so the minute tick doesn't re-render the grid. Overlap layout runs only when events change. No `memo`/`useMemo` was needed.

**Measurement:** `npm run measure:drag` (`scripts/measure-drag.mjs`, playwright-core driving the installed Chrome) opens a team week with **188 events** and drags one for 60 frame-paced steps. It records `requestAnimationFrame` frame times, `PerformanceObserver('longtask')` entries, and a `MutationObserver` over the grid. It runs at normal CPU and with 4× CPU throttling (CDP).

| CPU | p95 frame | max frame | frames > 33 ms | long tasks | DOM elements changed during drag |
|---|---|---|---|---|---|
| 1× | 16.8 ms | 16.8 ms | 0 | 0 | 3 (dragged block, overlay, preview) |
| 4× | 16.8 ms | 16.8 ms | 0 | 0 | 3 |

The MutationObserver column is DOM-level evidence. To check it at component level, record a drag in the React DevTools Profiler (development build); only the dragged `TimedEventBlock` and its `DragPreview` are expected to commit.

## 7. Decisions and rejected alternatives

| Decision | Simpler / common alternative | Why not |
|---|---|---|
| Own pointer code for drag-n-drop | dnd-kit | Dropping on a time grid is coordinate maths, not droppable targets; dnd-kit context updates would re-render more than the dragged block |
| URL as state + RSC for calendar and find-time | Client state + `fetch` in effects | Shareable links and Back for free; the router already keeps only the latest navigation, so no manual race handling |
| Server Actions for UI writes, Route Handlers as the public API | Client `fetch` to Route Handlers | Actions integrate with `useOptimistic`/`revalidatePath`; both call the same `server/*` functions |
| One RHF form for the two-step booking | A form per step | Answers would be lost when going back or when the slot was taken |
| SQLite (better-sqlite3), raw SQL, schema on startup | ORM / in-memory store | Synchronous API makes transactions simple; small schema doesn't need an ORM. Started in-memory, switched to SQLite on request |
| Native `<dialog>` and Popover API, `sonner` for toasts | Radix/shadcn | Focus trap, Escape and top layer come with the platform; a UI kit for one modal is too much |
| `MemberPicker` filters a preloaded list | Debounced `/api/members` requests | 30 members; client filtering is instant and race-free (the endpoint still exists) |
| Fixed 3 visible lanes in Month | Measure cell height in the browser | Keeps layout a pure, tested function |
| `cacheComponents` disabled | Next 16 scaffold default | It changes rendering rules app-wide; the classic model was enough for Core |

Not introduced on purpose: Redux/Zustand, React Query, repositories/services, generic API clients, a UI kit, `useMemo`/`useCallback` by default.

## 8. Known limitations (Core)

Hour labels on 23/25-hour days; no recurrence/series; no resize, drag-to-create, keyboard control or cross-week drag; no async conflict warnings, 409 diff dialog or dirty guard; fixed booking questionnaire; no `Idempotency-Key` (double click is prevented by the disabled button only); no e2e suite yet. The plan for each is in README.md.
