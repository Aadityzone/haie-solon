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
- `lib/server-cache.ts` (bounded in-process read cache) and `lib/rate-limit.ts`
  (bounded, proxy-aware, optionally shared limiter)
- `app/api/booking/*` (including `config/route.ts`), `app/api/owner/*`,
  `app/api/webhooks/whatsapp/route.ts`
- `app/owner/page.tsx`, `app/owner/login/page.tsx`, `app/book/page.tsx`,
  `app/book/status/page.tsx`
- `components/booking/BookingWizard.tsx`, `BookingDialog.tsx`, `BookingStart.tsx`,
  `ServicePicker.tsx`, `DatePicker.tsx`, `SlotPicker.tsx`, `ServiceBookAction.tsx`
- `components/ServiceMenu.tsx`, `components/ServiceHighlights.tsx`,
  `components/Services.tsx`
- `components/MotionProvider.tsx`, `components/ui/hero-3.tsx`,
  `components/Navbar.tsx`, `components/Gallery.tsx`,
  `components/booking/BookingDialog.tsx`
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
- Four indexes added during the scaling pass:
  `appointments(status, hold_expires_at)`, `appointments(status, start_time)`,
  `blocked_periods(start_time, end_time)`,
  `appointment_services(appointment_id)`, and
  `notification_logs(created_at DESC)`. See `PERFORMANCE.md` for the query plans
  they fix.
- `owner_settings.schema_version` records the schema generation this build
  applied, so a warm database skips the migration block instead of replaying it on
  every cold start. **Bump `SCHEMA_VERSION` in `lib/db.ts` whenever the schema or
  the seed catalogue changes**, or an existing deployment will silently miss it.
- No separate migration framework: `initDb()` applies everything idempotently on
  first access, including the catalogue install.

## Scaling pass

A separate pass optimised the application for roughly a hundred thousand visits a
day with spiky peaks, on either a single Node server or serverless hosting.
`PERFORMANCE.md` holds the methodology, the measured before/after figures, and the
remaining limits; this section records only what changed structurally.

- **The expired-hold sweep no longer runs on read paths.** `getAvailableSlots`,
  `getBookingRules`, and `getAppointmentByReference` used to issue an
  `UPDATE appointments` unconditionally, so every page view and availability poll
  took the database's write lock. They now call a throttled single-flight sweep
  (at most once per 60 s per process). `cleanupExpiredHolds()` itself is unchanged
  and still exact for the owner dashboard, and the customer-facing status is
  derived for a lapsed hold so what is reported stays correct between sweeps.
- **Constant data is cached in-process** (`lib/server-cache.ts`): the catalogue,
  opening hours, and booking rules, for 60 s, with tag invalidation from the owner
  routes and single-flight de-duplication. Deliberately not `unstable_cache`,
  which persists across restarts and could shadow a restored or reset database.
  Write paths read live — `createBookingRequest` uses
  `readBookingSettingsLive()` — so a booking can never be accepted under a rule
  the owner had already changed.
- **The homepage is prerendered again.** `force-dynamic` became
  `revalidate = 60`, with `revalidatePath("/")` plus a cache-tag drop from the
  owner's service routes. The menu also stopped computing the entire bookable
  window to read one boolean.
- **Every overlap predicate is sargable** (`start_time < ? AND end_time > ?`
  instead of `NOT (end_time <= ? OR start_time >= ?)`), and the missing indexes
  were added. Behaviour is identical; the existing unit tests cover it.
- **Rate limiting was rebuilt** (`lib/rate-limit.ts`). The three inline
  `Map<ip, number[]>` limiters never evicted a key — an unbounded memory-growth
  primitive — and keyed on the first `x-forwarded-for` entry, which a caller
  controls. The replacement is bounded, sweepable, reads the client address from
  the hop the nearest trusted proxy observed, covers the two previously
  unlimited public read endpoints, and can use a shared Redis over its REST API
  when `UPSTASH_REDIS_REST_*` is set. Sign-in still clears its counter on success.
- **The owner dashboard stopped amplifying itself.** The appointments list went
  from one query per appointment to a single `IN (...)` fetch grouped in memory
  (251 round trips → 2), and the overview's seven sequential day queries became
  one indexed range scan bucketed in memory. The WhatsApp webhook applies a whole
  callback in one batched write.
- **Cold start**: `initDb` skips the DDL and seed block when the stored
  `schema_version` matches.
- **Client delivery**: the booking wizard is no longer statically imported by
  every service card (`next/dynamic`), the hero no longer animates its two LCP
  candidates from `opacity: 0`, `priority` → `preload` (deprecated in Next 16),
  the gallery's mobile `sizes` no longer overstates the rendered width, and
  `next.config.ts` stops generating the 2048/3840 image widths this layout cannot
  request while holding derivatives for a week instead of four hours.
- **Tests**: the unit suite writes raw SQL directly to the database, bypassing the
  owner routes that now invalidate the cache, so its direct writes go through a
  `rawDb()` helper that clears the cache afterwards. Clearing only ever forces a
  live read, so it cannot mask a defect.

Verification run for this pass:

```
npx tsc --noEmit    → exit 0
npm run lint        → exit 0, 0 problems
npm test            → 18 tests, 18 pass, 0 fail
npm run build       → exit 0, 22 routes; "/" is Static with Revalidate 1m
npm run bench       → 5–6 statements per request → 0–3; writes on read paths → 0
npx playwright test tests/e2e/public-site.spec.ts tests/e2e/booking-flow.spec.ts
                    → 61 passed, 5 skipped, 2 failed (one test, both viewports)
```

**The 2 browser failures are a pre-existing defect in the test, not a regression.**
`tests/e2e/booking-flow.spec.ts:280` takes the slot's label — a 24-hour string
such as `13:45` — and asserts it is visible in the review step, which renders
`formatClockTime(selectedTime)` (`lib/money.ts:56`) and therefore displays
`1:45 pm IST`. The assertion can never hold. A Playwright page snapshot at the
failure confirms the review itself renders correctly — services, date, time,
length, name, mobile, notes, and total are all present and correct.

None of the files involved — `BookingWizard.tsx`, `lib/money.ts`, or
`booking-flow.spec.ts` — is modified by this pass, so the mismatch exists at
`HEAD`. It was left unfixed deliberately: whether the review should show 24-hour
or 12-hour time is the owner's product decision, and editing an assertion to make
a suite green is not a scaling change. The one-line fix, if 12-hour display is
intended, is to format the expected value the same way before asserting.

`public-site.spec.ts` passes, which is the suite that covers the homepage — the
route whose rendering model changed most in this pass.

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

## Animation integration audit

The GSAP + Motion integration was already present and committed; this pass audited
it and fixed the gaps rather than rebuilding it.

- **Dependencies.** `gsap@3.15.0` and `motion@14.1.0` are declared direct
  dependencies; `framer-motion@14.1.0` is `motion`'s own dependency, not a second
  animation library. `npm ls gsap motion framer-motion` shows one tree. Nothing was
  installed.
- **Fixed — Motion ignored reduced motion.** Motion's `MotionConfig` defaults to
  `reducedMotion: "never"`, so the mobile menu, the booking dialog, and the gallery
  lightbox kept animating when a visitor asked for less motion; the global
  `@media (prefers-reduced-motion: reduce)` rule only reaches CSS animations, not
  Motion's JavaScript animations. Added `components/MotionProvider.tsx`
  (`<MotionConfig reducedMotion="user">`) around the app in `app/layout.tsx`.
- **Improved — hero entrance.** `components/ui/hero-3.tsx` now runs one orchestrated
  `gsap.timeline()` (copy, then the visual column) applied in a layout effect, so
  there is no first-frame flash. GSAP still owns the scroll reveals in `Gallery.tsx`
  and `ServiceHighlights.tsx`; Motion still owns the local transitions. No element is
  animated by both, and every `gsap.context()` is reverted on unmount.

Verification run for this pass:

```
npx tsc --noEmit    → exit 0
npm run lint        → exit 0, 0 problems
npm test            → 18 tests, 18 pass, 0 fail
npm run build       → exit 0, 21 routes (NEXT_DIST_DIR=.build)
npx playwright test tests/e2e/animation.spec.ts tests/e2e/public-site.spec.ts
                    → 34 passed (desktop-chromium + mobile-chromium)
```

**Pre-existing browser-test failures (not caused by this work).** Running the whole
Playwright suite in this checkout fails a variable set of tests that also fail on
the untouched baseline (reproduced by stashing this pass's changes and re-running
`mobile.spec.ts` / `appointment-journey.spec.ts`): the mobile sweep's watcher records
Next.js RSC *prefetch* requests aborted by the next navigation as `requestfailed`
(no console errors); the owner dashboard exposes `tel:` links measured at 19px tall;
and `appointment-journey.spec.ts` asserts one specific rendered date. The failing set
changes between runs, which identifies them as environmental/flaky rather than
regressions. The animation spec itself passes cleanly on desktop and mobile.

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
5. Use a hosted libSQL database for serverless or multi-instance deployment, and
   set `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` so the rate limits
   are shared rather than per process. Set `TRUSTED_PROXY_HOPS` to match the
   number of proxies in front of the app.

**WhatsApp has not been tested with salon credentials.** No credentials exist in
this environment, so no message has been sent or delivered; every recorded attempt
is `SKIPPED` with its reason. No notification may be described as sent or delivered
until provider evidence exists.
