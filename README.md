# Team Scheduler

Team calendar with drag-n-drop, shared free-time search and public booking pages.
Next.js 16 (App Router), React 19, TypeScript strict, React Hook Form + zod, date-fns + @date-fns/tz, SQLite.

**Status:** all three levels from the spec are implemented: **Core**, **Advanced** and **Bonus**.
- **Core:** Week/Month calendar with drag-n-drop and optimistic updates, the event form as an intercepted modal, `/find-time`, the public booking page with guest timezone, the whole API, and the §8 cases.
- **Advanced:**
  - Day and Agenda views; the Agenda is virtualized and loads more in both directions.
  - Resize, drag-to-create and dragging past the visible week with auto-scroll.
  - Keyboard control: arrows move by 15 min or 1 day, Enter opens, Delete deletes, `T` jumps to today, `N` creates an event.
  - Per-column hour labels on 23/25-hour days.
  - Recurring events: RRULE editor with a summary and preview, DST-safe expansion on the server, and "this / following / all".
  - Async conflict warnings with "find nearest free time".
  - A 409 diff dialog and an unsaved-changes guard.
  - Booking: `Idempotency-Key`, a questionnaire builder with a runtime zod schema and `showIf`, and `revalidateTag`.
  - RTL and Playwright e2e tests.
- **Bonus:**
  - BroadcastChannel sync between tabs.
  - Offline queue for event moves.
  - `.ics` import.
  - Print view.
  - First day of the week from the browser language, with an override on `/settings`.

Architecture notes: [ARCHITECTURE.md](ARCHITECTURE.md).

## Quick start

Requires **Node.js 22.12+** (`.nvmrc`; Vitest 5 and better-sqlite3 need it) and Google Chrome (for `npm run test:e2e` and `npm run measure:drag`; or `PW_CHANNEL=chromium` after `npx playwright install chromium`).

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
| `npm run test:tz` | Unit tests under `TZ=Pacific/Auckland` and `TZ=America/Los_Angeles`; both always run, and the command fails if either fails |
| `npm run test:e2e` | Playwright e2e (3 scenarios from §5): builds and starts the app on port 3200 with a separate fresh DB `data/e2e.db` |
| `npm run db:reset` | Delete the local database and Next's caches of revalidated booking pages, then restart the server |
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
| `/calendar?view=day\|week\|month\|agenda&date=YYYY-MM-DD&tz=IANA[&show=team]` | Calendar views; the URL is the source of truth. `show=team` shows everyone's events. Toolbar: Import .ics, Print |
| `/calendar/events/new`, `/calendar/events/[id]` | Event form: a modal over the calendar on in-app navigation, a full page on direct load. Includes the repeat editor; an occurrence of a series asks "this / following / all" on save and delete |
| `/find-time?members=a,b&duration=60&from&to&tz[&room]` | Common free windows with a per-person timeline |
| `/settings` | Current user, default timezone, first day of the week; list of booking pages |
| `/settings/booking/[slug]` | Booking page settings and questionnaire builder with a live preview (owner only) |
| `/book/[slug]` | Public booking page (static). Seeded: `/book/intro-call` (Maria Garcia, New York, 30/60 min, 10 min buffers, 24 h notice) and `/book/team-sync` |
| `/book/[slug]/confirmed/[id]?token=`, `/book/[slug]/cancel/[id]?token=` | Guest's confirmation (with `.ics`) and cancellation |

## API

Errors always look like `{ "error": { "code", "message", "fieldErrors"?, "details"? } }`.

Input limits:
- **Dates and instants: years 1900–2100 only.** URLs, forms and API inputs outside this range are rejected (the calendar redirects). This prevents expanding recurring series across millennia.
- **Repeat rules: daily, weekly, monthly or yearly only.** Rules that repeat within a day (`HOURLY`…`SECONDLY`, `BYHOUR`/`BYMINUTE`/`BYSECOND`) are rejected; they could create hundreds of thousands of occurrences.

| Method | Path | Notes |
|---|---|---|
| GET | `/api/events?from&to&tz&members[]` | `from`/`to`: ISO with offset, or dates read in `tz` (inclusive). Max 92 days. Series are expanded on the server: each occurrence has id `<masterId>@<start ms>` and `seriesId` |
| POST | `/api/events` | Body = event form shape (`title, description, allDay, startDate, startTime, endDate, endTime, timezone, attendeeIds, location, recurrence`). 201 + `ETag` |
| PATCH | `/api/events/:id?scope=this\|following\|all&occurrence=<ISO>` | Partial body, **`If-Match: "<version>"` required** (428 without, 409 if stale, 403 if not an attendee). For an occurrence, `scope` is required; `:id` is the master id + `occurrence`, or the occurrence id |
| DELETE | `/api/events/:id?scope=…&occurrence=…` | `If-Match` optional; same addressing as PATCH |
| POST | `/api/availability` | `{ memberIds, roomId?, from, to, duration, tz? }`, dates inclusive. Returns `{ windows }` |
| POST | `/api/conflicts` | `{ start, end, attendeeIds, roomId?, ignoreEventId? }` (ISO with offset). Returns `{ conflicts: [{ kind: "member" \| "room", name, events }] }`; declined invitations don't count |
| GET | `/api/members?search=` | Name/email search |
| GET | `/api/book/:slug/slots?tz&duration[&from&to]` | Free slots for the guest; without `from`, starts "today" by the server clock |
| POST | `/api/book/:slug` | `{ start, duration, guestTimeZone, answers }`. Header `Idempotency-Key`: a repeat returns the same booking (200, `Idempotent-Replayed: true`); the same key with another body is 422. 409 `SLOT_TAKEN` with `details.alternatives` |
| GET | `/api/book/:slug/bookings/:id.ics?token=` | iCalendar file |
| GET / PUT | `/api/booking-pages/:slug` | Page settings. PUT is owner-only (403), validated (question union, unique ids/options/durations), then `revalidateTag("booking-page:<slug>")` rebuilds the static `/book/:slug` |

## Manual checks (spec §8)

| Case | Level | How to check | Expected |
|---|---|---|---|
| `?view=year`, `?date=2026-02-30`, `?tz=Mars/Base` | Core ✅ | Open `/calendar?view=year` etc. | Redirect to the canonical URL with the defaults |
| `MOCK_NOW=2026-10-25T00:30:00Z`, Kyiv DST week, event 03:30–04:30 and a daily 03:30 series | Core + Advanced ✅ | `MOCK_NOW=2026-10-25T00:30:00Z npm start`, open `/calendar?date=2026-10-25&tz=Europe/Kyiv`. Create the event, then a series starting Oct 23 at 03:30, Repeat: Daily | Sunday is "today" and marked **25 h**. The event is stored as `03:30+03:00 → 04:30+02:00` (the first 03:30, 2 real hours), shown once. The series shows exactly one 03:30 each day, including Oct 25 (the first, summer-time 03:30) |
| Series on the 31st / last Friday | Advanced ✅ | Event on Jan 31, Repeat: Monthly, "On day 31". Event on a last Friday (e.g. Oct 30, 2026), Monthly, "On the last Friday" | The summary says "(months without it are skipped)" and the preview has no February date. Last Fridays: Oct 30, Nov 27, Dec 25, Jan 29, Feb 26 |
| "This and following" on the first occurrence; "only this" on a moved occurrence | Advanced ✅ | Open the first occurrence of a series, change the time, pick "This and following". Then move one occurrence (drag it, or "This event"), open it and edit it | The whole series changes; no empty old series is left behind. A moved occurrence is a separate event linked by `seriesId`: editing it changes only it, without asking for a scope |
| Drag outside the visible week | Advanced ✅ | Drag an event to the left/right edge of the week grid and hold it there | Every 0.7 s held at the edge moves the target one week further, and the preview shows the target date. After the drop the event moves there and the calendar opens that week. Auto-scroll runs only while moving toward the top/bottom edge. Dragging an occurrence of a series moves only that occurrence |
| Auckland + Los Angeles, one hour next week | Core ✅ | `/find-time`, pick **Aroha Ngata** (Auckland) and **Ethan Brooks** (LA), next Mon–Sun, 1 h, tz UTC | Windows on Mon–Thu ≈ 20:00–24:00 UTC (LA afternoon = Auckland next morning), minus their meetings. None on Fri (Saturday in Auckland) |
| Room busy, one person busy, another free | Core + Advanced ✅ | In the event form, add two people and a room, then pick a time when the room and one person are busy. Also `/find-time` with a room | The form warns about each busy person and the booked room, not about the free one; you can still save, or click "Find nearest free time". In `/find-time` the room gets its own row |
| Hidden required conditional question | Advanced ✅ | `/book/intro-call`: "What is it about?" = "Pricing", leave "Tell us more" (required, hidden) empty, book. Then choose "Something else" and leave it empty | Hidden: booking goes through and the hidden value isn't sent. Shown and empty: "This question is required" blocks the booking |
| Owner changes questions while a guest fills the form | Advanced ✅ | Open `/book/intro-call` and fill the form. In another browser, as Maria Garcia, add a required question at `/settings/booking/intro-call` and save. Then book in the first browser | "The questions on this page were just updated…": the new question appears and existing answers are kept. New visitors get the rebuilt static page |
| Guest in Asia/Kolkata books an owner in America/New_York, 24 h notice | Core ✅ | Chrome DevTools → Sensors → Location → timezone `Asia/Kolkata` (or pick it in the form), open `/book/intro-call` | Times in Kolkata time; the first slot is ≥ 24 h after now (exact boundary covered by unit tests); the confirmation shows both timezones |
| Double click "Book" with `MOCK_LATENCY_MS=3000` | Core + Advanced ✅ | Start with the env var, book, double-click | One booking. The button is disabled while submitting, and every attempt carries an `Idempotency-Key`, so a retry after a timeout also returns the first booking |
| Close the event modal with unsaved changes (Escape, backdrop, Back) | Core + Advanced ✅ | Edit an event, then press Escape, click the backdrop or ×, press the browser Back button, or close/reload the tab | Each asks "Discard unsaved changes?". "Cancel" keeps the form and its values; "OK" closes it and restores the calendar URL. Reload/close shows the browser's own prompt. A clean form closes without asking |

More checks:
- **Two guests, one slot:** open `/book/intro-call` in two browsers, pick the same time and book in both. The second guest sees "someone just booked that time", five nearest alternatives, and their answers are kept.
- **Optimistic rollback:** `MOCK_FAILURE_RATE=1 MOCK_LATENCY_MS=800 npm start`, then drag an event. It moves at once, returns after ~0.8 s, and a toast explains why.
- **Version conflict:** open an event, change it through the API (`curl -X PATCH /api/events/<id> -H 'If-Match: "<version>"' -d '{"title":"x"}'`), then save the form. It shows the differing fields side by side, with "Keep my changes" and "Use saved version".

## Tests

- **261 Vitest tests** (`npm test`); they pass under both `TZ` values. Unit tests (`src/**/*.test.ts`) cover:
  - overlap layout, drag geometry and the week/month/agenda ranges with any first day of the week;
  - RRULE ↔ form structure, the summary, expansion across DST, on the 31st and on the last Friday, and the "this / following / all" planners;
  - conflicts, free-window intersection (incl. Auckland/LA), booking slots (buffers, minNotice boundary, Kolkata/New York);
  - the runtime answers schema with `showIf` chains, builder conversions, booking-page validation;
  - DST conversion, URL params, form schemas, `.ics` export and import, the offline queue and seed invariants.
- **RTL** (`*.test.tsx`, jsdom): the recurrence editor, the dynamic questionnaire with conditional questions, and the builder.
- **Playwright e2e** (`npm run test:e2e`, `e2e/`):
  1. Create an event by dragging on the grid, move it to another day, reload: it stays there.
  2. "This and following" on a series changes later occurrences and keeps earlier ones.
  3. Two guests race for one slot: the second sees a clear error and alternatives, and keeps the answers.

## Bonus details

- **Tab sync:** after a save, `BroadcastChannel("team-scheduler:calendar")` tells other tabs to `router.refresh()`.
- **Offline:** while offline, drag/keyboard moves go to a localStorage queue (one entry per event, keeping the first base version) and stay visible on the grid; a banner shows the count. On `online` they are sent through the same Server Action. A move the server rejects (e.g. 409) is dropped with a toast, and the calendar shows the server state. Forms and deletes need the network and say so.
- **`.ics` import:** the file is parsed in the browser (line unfolding, `TZID`/UTC/all-day, `DURATION`, `RRULE`). The server validates each event separately; unreadable or invalid ones are listed and the rest are imported. The current user becomes the attendee.
- **Print:** the Print button hides the app chrome and unrolls the scroll area.
- **First day of the week:** from `Intl.Locale#getWeekInfo` for the `Accept-Language` language, unless set on `/settings`. Week, month and the weekday headers follow it.

## Known limitations

- Rules created elsewhere that the form can't show (e.g. "3rd Tuesday" for an event on another date) are kept as "custom" and stay intact, but can only be replaced, not edited, in the form.
- Changing the whole series doesn't touch occurrences that were edited one by one (Google Calendar behaves the same).
- The offline queue covers moves only and needs the calendar to be already open: there is no service worker, so a reload while offline fails.
