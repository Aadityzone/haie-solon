# Project State — Salon Booking and Owner Operations

Companion to `PROJECT_AUDIT.md` (what was verified and why) and `DEPLOYMENT.md`
(how to ship it).

## Inspected

- Next.js 16 App Router, React 19, TypeScript, Tailwind v4, and `@libsql/client`.
- The existing booking modal/status flow, lazy schema setup and starter services,
  owner password/session helpers, booking and management APIs, and the WhatsApp
  Cloud API integration.
- The working tree already contained substantial uncommitted frontend and backend
  work; it was preserved. Nothing was reset, wiped, or force-pushed.

## Implemented

### Catalogue

- `config/service-catalogue.ts` is the single authoritative proposed catalogue,
  used both to seed the database and to populate the dashboard's suggestions.
- Seeding installs the standard salon catalogue as ordinary, owner-editable
  records: the proposed price is the starting price, the row is enabled, and
  `services.price_verified` stays `0` until the owner saves that row. The public
  menu therefore labels a proposed figure as proposed and stops doing so only
  once a human has reviewed it. An existing menu with different ids (for example
  the legacy seed) is only added to, never replaced; a catalogue row that is
  already present is never force-enabled by a later run.
- The public menu is server-rendered from the database, grouped by category, with
  a price only where the service has one and an honest state when nothing is
  published yet.
- Optional per-service images, validated as site-relative paths.
- Every menu entry deep-links to `/book?service=<id>` with that service
  preselected, and offers an in-place dialog that runs the identical wizard.

### Customer booking flow

- `/book` is a real five-step page — services, date, time, details, review — plus
  a confirmation state, built from `components/booking/*`. `components/booking/
  BookingDialog.tsx` wraps the same `BookingWizard` for the in-place entry from a
  menu card, so there is one flow, one set of requests, and one place the rules
  live.
- **No rule is duplicated in the UI.** `GET /api/booking/config` returns the
  enabled catalogue with its database price and duration, plus `rules`: window
  start/end, `minSelectableDate`, closed weekdays, blocked dates, the slot
  interval, and the buffer. The date picker disables a day only because the
  server said so, and states the reason in the day's accessible name. Selecting
  services re-reads the window with the combined duration the server derives from
  the selected ids — the frontend never sends a duration of its own choosing.
- Step 3 shows available and unavailable slots differently, gives each
  unavailable slot its reason, offers the next open days, and has honest empty
  states for a closed day and a fully booked day.
- The running total and combined duration are shown in a sticky summary; a
  selection is never lost by moving between steps. A service with no published
  price makes the summary say "Confirmed by the salon" rather than showing a
  partial figure.
- Step 4 validates name and Indian mobile number next to the field, moves focus to
  the first problem, and collects nothing beyond name, mobile, and optional notes.
- Step 5 reviews everything with a way back to each section, and a `dblclick` on
  Confirm produces exactly one request.
- Confirmation shows the reference, status, services, date, time, length, total,
  hold expiry, and what happens next, and links to the status lookup. It appears
  only after the backend has stored the appointment.

### Booking and privacy

- Transactional booking with overlap and blocked-period checks, expiry handling,
  price/duration snapshots, holding policy, and IST timezone handling (preserved
  and extended).
- `getBookingSettings()` is now the single reader of the owner's booking rules;
  `getAvailableSlots`, `getBookingRules`, and `createBookingRequest` all use it,
  so the window, interval, buffer, and hold can no longer disagree.
- Status lookup now requires the reference **and** the booking mobile number; a
  wrong reference and a wrong number are indistinguishable, and the response never
  contains the phone number.
- Typed `SalonError` separates customer-safe messages from internal failures, so
  database and infrastructure errors are logged and never echoed to a browser.
- `lib/logger.ts` emits one structured line per error with phone numbers redacted.

### Owner operations

- Overview tab from real SQL aggregates only: today's appointments, pending
  requests, upcoming confirmed, recorded completed value, a seven-day strip, and a
  status breakdown. Expired holds are released before counting.
- Appointments: date/week/status filters plus free-text search, with
  confirmation on reject, cancel, and blocked-period removal.
- Services: create, edit name/description/category/price/duration/image, enable,
  and disable; historical appointments keep their snapshot.
- Opening hours including daily breaks; blocked periods; booking rules.
- Notification panel reporting recorded attempt states and which WhatsApp
  settings are present (presence only, never values).
- Saving a service revalidates the public page immediately.

### Repairs

- Replaced the corrupted `README.md` (BOM + NUL bytes) and the incorrect build
  diagnosis in this file; cleared the stale `.next` cache that was failing the
  build; stopped lint scanning vendored agent-skill bundles; gitignored the local
  database.

## Main files

- `lib/booking-service.ts`, `lib/db.ts`, `lib/auth.ts`, `lib/errors.ts`,
  `lib/logger.ts`, `lib/time-utils.ts`, `lib/salon-dates.ts`, `lib/money.ts`,
  `lib/notifications/whatsapp.ts`, `lib/types.ts`
- `app/api/booking/*` (including `config/route.ts`), `app/api/owner/*`,
  `app/api/webhooks/whatsapp/route.ts`
- `app/owner/page.tsx`, `app/owner/login/page.tsx`, `app/book/page.tsx`,
  `app/book/status/page.tsx`
- `components/booking/BookingWizard.tsx`, `BookingDialog.tsx`, `BookingStart.tsx`,
  `ServicePicker.tsx`, `DatePicker.tsx`, `SlotPicker.tsx`, `ServiceBookAction.tsx`
- `components/ServiceMenu.tsx`, `components/ServiceHighlights.tsx`,
  `components/Services.tsx`
- `config/service-catalogue.ts`, `config/salon.ts`
- `tests/booking-service.test.cjs`, `tests/e2e/*`, `playwright.config.ts`
- `README.md`, `DEPLOYMENT.md`, `PROJECT_AUDIT.md`

## Schema changes

- `services.image_url` added with an idempotent `ALTER TABLE` guard.
- `services.price_verified` added with an idempotent `ALTER TABLE` guard. It
  records whether a human has reviewed that row's price; the dashboard's service
  save sets it to `1`, and the public menu uses it to describe a seeded figure as
  proposed.
- Existing guards continue to cover `appointments.whatsapp_opt_in` and
  `notification_logs.provider_message_id`.
- No separate migration framework: `initDb()` applies everything idempotently on
  first access, including the catalogue install.

## Build configuration

- `next.config.ts` reads `NEXT_DIST_DIR` (default `.next`). This checkout lives in
  a OneDrive-synced folder, where Turbopack's cleanup of the dependency junctions
  under `<distDir>/node_modules` fails with `EPERM` and stops the build;
  `.env.local` points the build at `.build` on this machine only, and
  `playwright.config.ts` points the test server at `.playwright/build`.

## Verification actually run

```
npx tsc --noEmit    → exit 0
npm run lint        → exit 0, 0 problems
npm test            → 12 tests, 12 pass, 0 fail
npx next build      → exit 0, 21 routes (NEXT_DIST_DIR=.build)
npx playwright test → 140 tests: 112 passed, 28 skipped by design, 0 failed
```

The 28 skips are deliberate: the full booking journey, the concurrency check,
the owner decision flows, and the mobile journey each run in exactly one browser
project because they reserve real intervals in one shared database.

`npx next build` cannot complete under the DSH file sandbox: its TypeScript worker
is refused piped child-process stdio (`spawn EPERM`). It was run outside the
sandbox instead, and `npx tsc --noEmit` verifies the same types inside it. The
Playwright suite likewise runs the build and a real server, so it needs the same
wider access.

## Production steps still required

1. Set `AUTH_SECRET` and `OWNER_SETUP_TOKEN`; sign in at `/owner/login`, create the
   owner password, then remove the setup token from the environment.
2. Open `/owner` → Services and confirm every seeded service: its name,
   description, category, price, and duration. Saving a row marks its price as
   reviewed and removes the "proposed" wording from the public menu. Disable or
   delete anything the salon does not offer. Until this is done, the prices
   customers see are the brief's proposals, labelled as such.
3. Confirm the opening hours, breaks, blocked periods, booking window, slot
   interval, hold duration, and buffer, and confirm the salon name, address, and
   photography (the imagery is illustrative and labelled as such).
4. Configure approved WhatsApp templates and credentials, a local test recipient,
   and the production owner recipient separately. Configure the Meta callback URL
   `/api/webhooks/whatsapp`, verify token, app secret, and status subscription.
5. Use a hosted libSQL database and a shared/edge rate limiter for serverless or
   multi-instance deployment; current limits are process-local.

**WhatsApp has not been tested with salon credentials.** No credentials exist in
this environment, so no message has been sent or delivered; every recorded attempt
is `SKIPPED` with its reason. No notification may be described as sent or delivered
until provider evidence exists.
