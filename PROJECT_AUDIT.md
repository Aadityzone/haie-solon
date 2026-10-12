# Project Audit — `haie-solon` salon booking site

Audited against the working tree at `C:\Users\Aaditya Kumar\OneDrive\Documents\Aaditya\hair shop`
(branch `main`, remote `https://github.com/Aadityzone/haie-solon.git`, HEAD `54c9e03`).

Every finding below was verified by reading the current source or by running a
command. Claims that could not be verified are listed as blocked, not assumed.

## 1. Stack actually present

| Component | Version | Evidence |
| --- | --- | --- |
| Next.js (App Router, Turbopack) | 16.4.0 | `package.json`, `next build` banner |
| React / React DOM | 19.3.0 | `package.json` |
| TypeScript | 5.x | `tsconfig.json`, `npx tsc --noEmit` |
| Tailwind CSS | v4 via `@tailwindcss/postcss` | `globals.css` `@theme` block |
| libSQL | `@libsql/client` 0.18 | `lib/db.ts` |
| GSAP | 3.15 (core + ScrollTrigger) | `components/ui/hero-3.tsx`, `Gallery.tsx`, `ServiceHighlights.tsx` |
| Motion for React | 14.1 | `Navbar`, `components/booking/*`, `Gallery` |
| Playwright | `@playwright/test` 1.64, Chromium 1248 | `npx playwright --version`, browser cache |

Caching model: `cacheComponents` is **not** enabled in `next.config.ts`, so this
project uses the previous rendering model and `export const revalidate` remains
valid (confirmed in `node_modules/next/dist/docs/.../route-segment-config/index.md`,
which records that `dynamic`/`revalidate` are removed *only* when Cache Components
is on). The homepage is cached with a 60-second window and is invalidated
immediately via `revalidatePath("/")` whenever the owner saves a service.

Validation is hand-written per route: `zod` is on disk only as a transitive
dependency, is not a declared dependency, and was deliberately not adopted rather
than depending on an undeclared package. Every route validates server-side and the
rules are covered by unit and browser tests.

## 2. Defects found and fixed

### Repository and build health

1. **`README.md` was corrupted.** Bytes began with a UTF-8 BOM and ended with 14
   NUL bytes plus a stray UTF-16LE fragment (`# haie-solon`). The file could not be
   read as text at all. Replaced with accurate documentation.
2. **`PROJECT_STATE.md` misdiagnosed the build failure.** It blamed a leading BOM
   in `package.json`. That file has **no** BOM (first bytes `7B 0A 20 20`). The real
   cause was a **stale/locked `.next` cache** (`EPERM: unlink '.next\node_modules\@libsql\client-…'`).
   In the restricted sandbox the build also fails earlier with `spawn EPERM`
   because the TypeScript worker cannot open piped stdio.
3. **Lint was polluted by vendored tooling.** 282 warnings, all from mirrored
   agent-skill bundles under `.claude/skills/**` and siblings. Lint is now clean.
4. **`salon.db` was untracked but not gitignored**, so a `git add -A` could have
   committed real customer records. Now ignored; the file itself was never
   modified (last write predates this work).

### Service catalogue — three disagreeing sources

5. **The catalogue had three conflicting definitions.** `lib/db.ts` seeded 18
   services with its own names and durations, `config/salon.ts` exported a
   `serviceCategories` array imported nowhere (dead code), and
   `config/proposed-services.ts` held a different 10-entry list used only by the
   dashboard. Consolidated into one authoritative module,
   `config/service-catalogue.ts`, which seeds the database and drives the
   dashboard's suggestions. The dead export was removed.
6. **The public site never showed the configurable catalogue.** The only way to
   see a real service was inside the booking modal. The homepage now renders the
   live menu, grouped by category, showing a price only when the owner set one.
7. **The catalogue was silently filtered.** `getActiveServices()` carried
   `AND lower(name) NOT LIKE '%beard%' AND lower(name) <> 'clean shave'`.
   Undocumented, contradicting the unisex brief, and it made owner activation
   unreliable: an owner could mark a beard service available and it would never
   reach a customer. Removed; visibility is governed only by `is_active`.
8. **`imageUrl` did not exist**, although each service is specified to support an
   optional image. Added as an idempotent column, with a validator that only
   accepts site-relative paths (`//host`, `https://…`, `javascript:…`, and paths
   containing spaces are all refused).
9. **A dead prop broke service deep-links.** The booking dialog accepted
   `preselectedServiceId` but no caller ever passed it, so "book this service"
   was impossible. A menu entry now deep-links to `/book?service=<id>`, and the
   booking page selects that service only if the salon actually offers it.

### Booking and privacy

10. **Customers could read raw server errors.** `POST /api/booking/create` echoed
    `error.message` for any failure, so a database error would surface
    `LibsqlError: …` to a browser. Introduced a typed `SalonError` for messages
    written for customers; any other error is logged and answered with a generic
    message and HTTP 500. The same treatment was applied to the slots, status,
    owner-appointment, and blocked-period routes.
11. **The status lookup trusted a reference alone.** A booking reference was the
    only credential. It is high-entropy and rate limited, but the lookup is now
    two-factor: reference **plus** the mobile number used for the booking. A wrong
    reference and a wrong number return an identical 404, so neither confirms the
    other exists, and the response never contains the phone number.
12. **Customer contact data could reach logs.** Added `lib/logger.ts`, which emits
    one structured line per error and redacts phone numbers before writing.

### Owner operations

13. **Break periods were unreachable.** The API and the slot engine fully
    supported `breakStart`/`breakEnd`, but the dashboard exposed no inputs, so the
    feature could not be used. Added with client-side validation.
14. **There was no overview.** The dashboard opened on a filtered list with no
    operational summary. Added an Overview tab driven by real SQL aggregates only
    — today's appointments, pending requests, upcoming confirmed, recorded value
    of completed appointments, a seven-day strip, and a status breakdown. Expired
    holds are released before counting. Nothing is estimated or synthesised.
15. **Notification outcomes were invisible.** The integration recorded
    `SKIPPED`/`FAILED`/`ACCEPTED`/`DELIVERED` but nothing surfaced them. Added a
    read-only endpoint and dashboard panel that reports which settings are present
    (presence only, never values).
16. **Destructive actions had no confirmation** (reject, cancel, remove block).
    Each now requires confirmation.
17. **Appointments could not be searched**, only filtered by date and status.
    Added free-text search across reference, name, mobile, and service.

### Tooling

18. **No browser tests existed** despite `@playwright/test` being a declared
    dependency with Chromium installed. Added 58 tests across desktop and mobile.
19. **`PROJECT_AUDIT.md` did not exist.** This file is it.

## 3. Verified-working behaviour (preserved, not rebuilt)

- **Concurrency.** `createBookingRequest` re-checks appointment and blocked-period
  overlap inside an exclusive `db.transaction("write")` before inserting. Two
  simultaneous identical requests resolve to exactly one fulfilled and one
  rejected (unit test), and a second attempt on a held slot returns HTTP 409
  `SLOT_CONFLICT` (browser test).
- **Trusted pricing/duration.** Price and duration are read from `services` rows
  and snapshotted into `appointment_services`; later catalogue edits never rewrite
  history. A zero price is preserved as ₹0, not treated as unset.
- **Booking references.** `BK-` plus 8 characters from a 32-symbol set that omits
  `I`, `O`, `0`, and `1`.
- **Owner authentication.** scrypt with a per-hash salt and timing-safe compare;
  HMAC-SHA256 session tokens with expiry and tamper rejection; login throttling;
  one-time `OWNER_SETUP_TOKEN` gate; every `/api/owner/*` route returns 401 without
  a session (browser-tested).
- **WhatsApp integrity.** Template-only sends, opt-in required for customers, the
  owner recipient never falls back from production to the development number,
  transient 429/5xx retried at most twice, duplicate events suppressed by a unique
  index, and `x-hub-signature-256` verified with a timing-safe compare. An API
  `ACCEPTED` is recorded as accepted, never as delivered.
- **Motion discipline.** GSAP drives scoped, reversible reveals; Motion drives
  local interactive transitions; no property is animated by both. Reduced motion
  disables the marquee, the reveals, and smooth scrolling (browser-tested).
- **Responsive layout.** No horizontal overflow on any public page at 360, 414,
  768, 1280, or 1920px, and primary controls meet the 44px touch target
  (browser-tested).

## 4. Blocked or unverifiable

| Item | Status | Exact blocker |
| --- | --- | --- |
| WhatsApp message delivery | **Blocked** | No `WHATSAPP_API_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_OWNER_RECIPIENT`, approved template names, or `WHATSAPP_APP_SECRET` exist in this environment. No message has been sent or delivered. Every attempt is recorded `SKIPPED` with its reason, and a browser test asserts it. |
| Edge/shared rate limiting | **Not implemented** | Limits are process-local `Map`s. Correct for one instance; a fleet needs a shared store. Documented in `DEPLOYMENT.md`. |
| Figma MCP | **Not available** | No Figma MCP server is configured anywhere in the repository, and no Figma file or token was provided. Nothing to reuse; no design import was performed. |
| Playwright MCP | **Configured, not reachable from this session** | `.agents/mcp_config.json` declares `@playwright/mcp` for Antigravity. It exposes no tools to this session, so browser verification used the project's own `@playwright/test` against a real production server. |
| `next build` inside this sandbox | **Needs full access** | The TypeScript worker fails with `spawn EPERM` under the sandbox because it cannot open piped stdio. The build itself is healthy. |
| Real owner data | **Untouched** | `salon.db` was never read or mutated by any test. Browser tests use `.playwright/salon-e2e.db`, reset per run. |

## 5. Verification actually run

```
npx tsc --noEmit    → exit 0
npm run lint        → exit 0, 0 problems
npm test            → 12 tests, 12 pass, 0 fail
npm run build       → exit 0, 22 routes
npx playwright test → 58 tests, 58 pass (desktop 1440×900 + Pixel 7)
```

**Unit coverage:** malformed dates/phones/duplicate services, price and duration
snapshots, zero-price services, simultaneous overlapping requests, approval and
cancellation releasing capacity, hold expiry, timezone boundaries, the catalogue
being governed by `is_active` alone (regression guard for the removed filter),
image round-trip, reference-plus-phone privacy (wrong number, another customer's
number, malformed number, unknown reference all resolve to nothing), slot
availability with breaks/blocks/holds, booking-window limits, refused approval on
a newly blocked interval, WhatsApp retry/dedup/webhook signature, and session
tamper rejection.

**Browser coverage:** homepage sections and skip link, live-menu vs unpublished
state, no price published in the editorial highlights, gallery lightbox keyboard
open/close, reduced-motion marquee, the booking dialog at five viewports, service
deep-link preselection, unknown/wrong-number reference handling, public catalogue
activation, slot-query validation, owner redirect/401/wrong password/tab
navigation/sign-out, break validation, service image validation, the honest
unconfigured-WhatsApp panel, overview aggregates, and the full
publish → deep-link → request → track → approve → double-booking-refused journey.

## 6. Remaining owner work (not code)

1. Set `AUTH_SECRET` and a one-time `OWNER_SETUP_TOKEN`, then create the owner
   password at `/owner/login`, then remove the setup token.
2. Confirm the salon name, address, opening hours, and the real service menu with
   prices, and enable those services.
3. Approve the photography; current images are illustrative and labelled as such.
4. Supply WhatsApp credentials and approved template names before expecting any
   notification to leave the building.
5. Move to a hosted libSQL database if deploying to serverless or more than one
   instance. See `DEPLOYMENT.md`.
