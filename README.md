# Team Scheduler

Team calendar with drag-n-drop, shared free-time search and public booking pages.
Next.js 16 (App Router), React 19, TypeScript strict, React Hook Form + zod, date-fns + @date-fns/tz, SQLite.

**Status:** the **Core** level is implemented, along with the whole API from the spec. From **Advanced**:
- recurring events and series: the RRULE editor with a summary and preview, server-side expansion that is DST-safe, and edits for "this / this and following / all";
- async conflict warnings in the event form, debounced and cancellable, with "find nearest free time";
- a 409 dialog that shows what someone else changed and lets the user keep their changes or take the saved version;
- an unsaved-changes guard for Escape, backdrop/×/Cancel, the browser Back button and closing the tab;
- `Idempotency-Key` for bookings;
- `revalidateTag` that rebuilds the static booking page when its settings change.

The remaining Advanced and Bonus items are listed at the end, each with a plan.
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
| `/calendar/events/new`, `/calendar/events/[id]` | Event form: a modal over the calendar on in-app navigation, a full page on direct load. Includes the repeat editor; an occurrence of a series asks "this / following / all" on save and delete |
| `/find-time?members=a,b&duration=60&from&to&tz[&room]` | Common free windows with a per-person timeline |
| `/settings` | Current user and default timezone |
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
| Drag outside the visible week | Advanced ❌ | | Drag works inside the visible week; the drop is clamped to its edges. Dragging an occurrence of a series moves only that occurrence |
| Auckland + Los Angeles, one hour next week | Core ✅ | `/find-time`, pick **Aroha Ngata** (Auckland) and **Ethan Brooks** (LA), next Mon–Sun, 1 h, tz UTC | Windows on Mon–Thu ≈ 20:00–24:00 UTC (LA afternoon = Auckland next morning), minus their meetings. None on Fri (Saturday in Auckland) |
| Room busy, one person busy, another free | Core + Advanced ✅ | In the event form, add two people and a room, then pick a time when the room and one person are busy. Also `/find-time` with a room | The form warns about each busy person and the booked room, not about the free one; you can still save, or click "Find nearest free time". In `/find-time` the room gets its own row |
| Hidden required conditional question | Advanced ❌ | | Core uses a fixed questionnaire |
| Owner changes questions while a guest fills the form | Advanced ❌ | | |
| Guest in Asia/Kolkata books an owner in America/New_York, 24 h notice | Core ✅ | Chrome DevTools → Sensors → Location → timezone `Asia/Kolkata` (or pick it in the form), open `/book/intro-call` | Times in Kolkata time; the first slot is ≥ 24 h after now (exact boundary covered by unit tests); the confirmation shows both timezones |
| Double click "Book" with `MOCK_LATENCY_MS=3000` | Core + Advanced ✅ | Start with the env var, book, double-click | One booking. The button is disabled while submitting, and every attempt carries an `Idempotency-Key`, so a retry after a timeout also returns the first booking |
| Close the event modal with unsaved changes (Escape, backdrop, Back) | Core + Advanced ✅ | Edit an event, then press Escape, click the backdrop or ×, press the browser Back button, or close/reload the tab | Each asks "Discard unsaved changes?". "Cancel" keeps the form and its values; "OK" closes it and restores the calendar URL. Reload/close shows the browser's own prompt. A clean form closes without asking |

More checks:
- **Two guests, one slot:** open `/book/intro-call` in two browsers, pick the same time and book in both. The second guest sees "someone just booked that time", five nearest alternatives, and their answers are kept.
- **Optimistic rollback:** `MOCK_FAILURE_RATE=1 MOCK_LATENCY_MS=800 npm start`, then drag an event. It moves at once, returns after ~0.8 s, and a toast explains why.
- **Version conflict:** open an event, change it through the API (`curl -X PATCH /api/events/<id> -H 'If-Match: "<version>"' -d '{"title":"x"}'`), then save the form. It shows the differing fields side by side, with "Keep my changes" and "Use saved version".

## Tests

211 unit tests (`src/**/*.test.ts`) cover:
- overlap layout and lanes;
- RRULE ↔ form structure, the summary text, expansion across DST, on the 31st and on the last Friday;
- the "this / following / all" operations;
- conflicts and booking-page settings validation;
- free-window intersection, including Auckland/LA;
- booking slots (buffers, minNotice boundary, Kolkata/New York);
- DST conversion;
- the form schemas, URL params, `.ics` and the seed invariants.

They pass under both `TZ` values. The UI flows were checked in headless Chrome during development. Turning those scripts into Playwright e2e tests is part of the Advanced plan.

## Not done yet, and the plan

Ordered by value for the evaluation criteria.

1. **Calendar extras.**
   - Resize and drag-to-create, reusing the `TimedEventBlock` pointer pattern.
   - Keyboard: roving tabindex in the grid, arrows move by 15 min/1 day, Enter, Delete, `T`, `N`.
   - Per-column hour labels on 23/25-hour days.
   - Dragging past the visible week with auto-scroll.
   - Day and Agenda views; Agenda uses `@tanstack/react-virtual` and date-range paging.
2. **Booking extras.**
   - Question builder on `/settings/booking/[slug]` (`useFieldArray` over a discriminated union, with `showIf`), saving through the existing `PUT /api/booking-pages/:slug`.
   - zod schema built at runtime from `questions`, on both client and server.
3. **Tests.** RTL for the recurrence editor, the dynamic questionnaire and the builder; three Playwright e2e scenarios from §5.
4. **Series details.** Rules created elsewhere that the form can't show (e.g. "3rd Tuesday" for an event on another date) are kept as "custom" and stay intact, but can only be replaced, not edited, in the form. Changing the whole series doesn't touch occurrences that were edited one by one (Google Calendar behaves the same).
5. **Bonus.** BroadcastChannel sync between tabs, offline queue, `.ics` import, print view, locale-aware first day of week.
