# Team Scheduler

Team calendar with drag-n-drop, shared free-time search and public booking pages.
Next.js 16 (App Router), React 19, TypeScript strict, React Hook Form + zod, date-fns + @date-fns/tz, SQLite.

**Status:** the **Core** level is implemented. Advanced and Bonus items are listed at the end, each with a plan.
Architecture notes: [ARCHITECTURE.md](ARCHITECTURE.md).

## Quick start

Requires **Node.js 22.12+** (`.nvmrc`; Vitest 5 and better-sqlite3 need it) and Google Chrome (only for `npm run measure:drag`).

```bash
nvm use
npm install
npm run dev            # http://localhost:3000 -> /calendar
```

The SQLite database `data/scheduler.db` is created and seeded on first start: 30 members in 8 timezones, 5 rooms, 5000 events over ±90 days, 2 booking pages. `npm run db:reset` deletes it, and the next start seeds again.

There is no authentication. The current user and their default timezone are chosen on `/settings` and stored in a cookie. The default user is **Olena Kovalenko** (Europe/Kyiv).

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` / `npm run build && npm start` | Dev server / production build |
| `npm run lint`, `npm run typecheck` | ESLint, TypeScript (generates Next route types first) |
| `npm test` | Unit tests (Vitest) |
| `npm run test:tz` | Unit tests under `TZ=Pacific/Auckland` and `TZ=America/Los_Angeles`; results must be identical |
| `npm run db:reset` | Delete the local database |
| `npm run measure:drag` | Drag performance measurement against a running server (see ARCHITECTURE.md §6) |

## Environment

All variables are optional; see `.env.example`.

| Variable | Default | Meaning |
|---|---|---|
| `SITE_URL` | `http://localhost:3000` | Absolute base for Open Graph image URLs |
| `DATABASE_PATH` | `data/scheduler.db` | SQLite file |
| `MOCK_NOW` | real time | Freeze "now", ISO with offset, e.g. `2026-10-25T00:30:00Z` |
| `MOCK_LATENCY_MS` | `0` | Extra latency for every API call and Server Action |
| `MOCK_FAILURE_RATE` | `0` | Probability (0..1) of a simulated `503 MOCK_FAILURE` |

`/api/availability` (and the `/find-time` results) add 300–1200 ms on top, as the spec requires. Page reads in Server Components are not slowed down or failed, so a simulated failure can't take down a whole page.

## Pages

| Route | What it does |
|---|---|
| `/calendar?view=week\|month&date=YYYY-MM-DD&tz=IANA[&show=team]` | Week/Month views, URL is the source of truth. `show=team` shows everyone's events |
| `/calendar/events/new`, `/calendar/events/[id]` | Event form: a modal over the calendar on in-app navigation, a full page on direct load |
| `/find-time?members=a,b&duration=60&from&to&tz[&room]` | Common free windows with a per-person timeline |
| `/settings` | Current user and default timezone |
| `/book/[slug]` | Public booking page (static). Seeded: `/book/intro-call` (Maria Garcia, New York, 30/60 min, 10 min buffers, 24 h notice) and `/book/team-sync` |
| `/book/[slug]/confirmed/[id]?token=`, `/book/[slug]/cancel/[id]?token=` | Guest's confirmation (with `.ics`) and cancellation |

## API

Errors always look like `{ "error": { "code", "message", "fieldErrors"?, "details"? } }`.

| Method | Path | Notes |
|---|---|---|
| GET | `/api/events?from&to&tz&members[]` | `from`/`to`: ISO with offset, or dates read in `tz` (inclusive). Max 92 days |
| POST | `/api/events` | Body = event form shape (`title, description, allDay, startDate, startTime, endDate, endTime, timezone, attendeeIds, location`). 201 + `ETag` |
| PATCH | `/api/events/:id` | Partial body, **`If-Match: "<version>"` required** (428 without, 409 if stale, 403 if not an attendee) |
| DELETE | `/api/events/:id` | `If-Match` optional |
| POST | `/api/availability` | `{ memberIds, roomId?, from, to, duration, tz? }`, dates inclusive. Returns `{ windows }` |
| GET | `/api/members?search=` | Name/email search |
| GET | `/api/book/:slug/slots?tz&duration[&from&to]` | Free slots for the guest; without `from`, starts "today" by the server clock |
| POST | `/api/book/:slug` | `{ start, duration, guestTimeZone, answers }`. 409 `SLOT_TAKEN` with `details.alternatives` |
| GET | `/api/book/:slug/bookings/:id.ics?token=` | iCalendar file |

Not implemented yet: `scope`/`occurrence` (series), `POST /api/conflicts`, `GET/PUT /api/booking-pages/:slug`, `Idempotency-Key`. See the plan below.

## Manual checks (spec §8)

| Case | Level | How to check | Expected |
|---|---|---|---|
| `?view=year`, `?date=2026-02-30`, `?tz=Mars/Base` | Core ✅ | Open `/calendar?view=year` etc. | Redirect to the canonical URL with the defaults |
| `MOCK_NOW=2026-10-25T00:30:00Z`, Kyiv DST week, event 03:30–04:30 | Core ✅ | `MOCK_NOW=2026-10-25T00:30:00Z npm start`, open `/calendar?date=2026-10-25&tz=Europe/Kyiv`, create the event | Sunday is "today" and marked **25 h**. The event is stored as `03:30+03:00 → 04:30+02:00` (the first 03:30, 2 real hours), shown once. A daily 03:30 series needs recurrence (Advanced) |
| Series on the 31st / last Friday | Advanced ❌ | | |
| "This and following" on the first occurrence / moved occurrence | Advanced ❌ | | |
| Drag outside the visible week | Advanced ❌ | | Drag works inside the visible week; the drop is clamped to its edges |
| Auckland + Los Angeles, one hour next week | Core ✅ | `/find-time`, pick **Aroha Ngata** (Auckland) and **Ethan Brooks** (LA), next Mon–Sun, 1 h, tz UTC | Windows on Mon–Thu ≈ 20:00–24:00 UTC (LA afternoon = Auckland next morning), minus their meetings. None on Fri (Saturday in Auckland) |
| Room busy, one person busy, another free | Core ✅ partly | `/find-time` with a room | The room gets its own row and its bookings are excluded. Async conflict warnings in the event form are Advanced |
| Hidden required conditional question | Advanced ❌ | | Core uses a fixed questionnaire |
| Owner changes questions while a guest fills the form | Advanced ❌ | | |
| Guest in Asia/Kolkata books an owner in America/New_York, 24 h notice | Core ✅ | Chrome DevTools → Sensors → Location → timezone `Asia/Kolkata` (or pick it in the form), open `/book/intro-call` | Times in Kolkata time; the first slot is ≥ 24 h after now (exact boundary covered by unit tests); the confirmation shows both timezones |
| Double click "Book" with `MOCK_LATENCY_MS=3000` | Core ✅ | Start with the env var, book, double-click | One booking: the button is disabled while submitting. A retry after a timeout still needs `Idempotency-Key` (Advanced) |
| Close the event modal with unsaved changes (Escape, backdrop, Back) | Core ✅ partly | Edit an event, then close | All three close the modal and restore the URL. The dirty guard (confirm before discarding) is Advanced |

More checks:
- **Two guests, one slot:** open `/book/intro-call` in two browsers, pick the same time and book in both. The second guest sees "someone just booked that time", five nearest alternatives, and their answers are kept.
- **Optimistic rollback:** `MOCK_FAILURE_RATE=1 MOCK_LATENCY_MS=800 npm start`, then drag an event. It moves at once, returns after ~0.8 s, and a toast explains why.
- **Version conflict:** `curl -X PATCH /api/events/<id> -H 'If-Match: "1"'` twice. The second call gets 409.

## Tests

144 unit tests (`src/**/*.test.ts`) cover:
- overlap layout and lanes;
- free-window intersection, including Auckland/LA;
- booking slots (buffers, minNotice boundary, Kolkata/New York);
- DST conversion;
- the form schemas, URL params, `.ics` and the seed invariants.

They pass under both `TZ` values. The UI flows were checked in headless Chrome during development. Turning those scripts into Playwright e2e tests is part of the Advanced plan.

## Not done yet, and the plan

Ordered by value for the evaluation criteria.

1. **Recurrence and series (2.1/2.2).**
   - Store the RRULE on the master and expand on the server per requested range with `rrule`.
   - Generate in wall time and convert each occurrence with `wallTimeToInstant`, so a daily 03:30 series stays correct across DST.
   - Apply `exdates`.
   - "This / this and following / all" as pure functions over (master, occurrence), with tests.
   - Recurrence editor: structured form ↔ RRULE, plus a human-readable summary and a preview of the next 5 dates.
2. **Event form extras.**
   - Async conflict warnings: `POST /api/conflicts`, debounced, with `AbortController`.
   - 409 dialog that shows the server version and lets the user choose.
   - Dirty guard: `beforeunload`, plus intercepting Escape/backdrop/Back.
3. **Calendar extras.**
   - Resize and drag-to-create, reusing the `TimedEventBlock` pointer pattern.
   - Keyboard: roving tabindex in the grid, arrows move by 15 min/1 day, Enter, Delete, `T`, `N`.
   - Per-column hour labels on 23/25-hour days.
   - Dragging past the visible week with auto-scroll.
   - Day and Agenda views; Agenda uses `@tanstack/react-virtual` and date-range paging.
4. **Booking extras.**
   - Question builder: `useFieldArray` over a discriminated union, with `showIf`.
   - zod schema built at runtime from `questions`, on both client and server.
   - `PUT /api/booking-pages/:slug` with `revalidateTag` for the static page.
   - `Idempotency-Key`: a table of key → stored response, written in the booking transaction.
5. **Tests.** RTL for the recurrence editor, the dynamic questionnaire and the builder; three Playwright e2e scenarios from §5.
6. **Bonus.** BroadcastChannel sync between tabs, offline queue, `.ics` import, print view, locale-aware first day of week.
