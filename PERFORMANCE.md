# Performance and scaling

What was changed to make this application comfortable at roughly a hundred
thousand visits a day with spiky peaks, and the measurements that justify each
claim. Companion to `PROJECT_STATE.md` (what the product does) and
`DEPLOYMENT.md` (how to ship it).

Every number below was produced on this checkout by `npm run bench`, which is
committed and reproducible. No figure here is estimated from reading the code
unless it is explicitly labelled as an extrapolation.

## The target

Chosen with the owner: **~100,000 visits per day, spiky**, so roughly 1.2
requests per second on average and peaks in the tens per second. Hosting was
deliberately left open, so every change here works on a single Node server and
on serverless without a configuration change; anything needing shared
infrastructure is opt-in through an environment variable.

## What was actually wrong

Four properties, in order of impact.

1. **Every read performed a write.** `getAvailableSlots`, `getBookingRules`, and
   `getAppointmentByReference` each began with an unconditional
   `UPDATE appointments` — the expired-hold sweep. So a marketing page view, an
   availability poll, and a booking-status lookup all took the database's single
   writer lock. On local SQLite that serialises reads behind writes; on a hosted
   libSQL/Turso database it is a replicated write transaction per page view.
2. **Nothing was cached, and the homepage could not be.** The public page was
   `force-dynamic` and its menu component computed the entire bookable window —
   settings, all seven opening-hours rows, the blocked-period range, and the
   closed-date list — in order to display one boolean. No `Cache-Control`
   existed anywhere, so no CDN or proxy could hold anything.
3. **The indexes did not match the queries.** The only index on `appointments`
   led with `start_time`, while the dominant predicates lead with `status` and
   `hold_expires_at`. `blocked_periods` and `appointment_services` had no
   indexes at all. The overlap predicates were written as
   `NOT (end_time <= ? OR start_time >= ?)`, which no planner can seek on.
4. **The owner dashboard amplified itself.** One page load issued 251 round trips
   (one parent query plus one per appointment), and the overview ran seven
   sequential day queries that one `GROUP BY` could answer.

Two smaller ones: the rate limiters were unbounded `Map`s keyed on a
client-controlled header, and `initDb` replayed ~20 DDL and seed statements per
cold start.

## Measured result

Method: `npm run bench` seeds 4,000 appointments across a 30-day window plus 20
blocked periods, then counts the database statements each request shape issues
and times them. Statement counts are deterministic and machine-independent;
timings are not, so they are reported second.

The "before" column is a pristine `git archive HEAD` checkout in a scratch
directory, measured by the identical script with `SALON_BENCH_ROOT` pointed at
it. Both trees therefore ran the same instrumentation against the same data.

### Database statements per request

| Request | Before | After (warm) | After (cache cold) |
| --- | --- | --- | --- |
| Homepage menu | 6 (5 reads, **1 write**) | **0** | 1 read, 0 writes |
| Booking config | 11 (9 reads, **2 writes**) | **3 reads, 0 writes** | 6 reads, 0 writes |
| Availability check | 5 (4 reads, **1 write**) | **2 reads, 0 writes** | 4 reads, 0 writes |

The single most important line is the write column. It is now **zero on every
read path**, which is what stops page views from contending with booking
transactions for the write lock.

"Cold" is what a request costs when the read cache has to be bypassed — it is
the honest comparison point for the older revision, which had no cache at all
and was therefore always cold.

### Latency and throughput

| Metric | Before | After |
| --- | --- | --- |
| Homepage menu, per request | 2.02 ms | 0.0007 ms (warm) / 0.21 ms (cold) |
| Booking config, per request | 3.61 ms | 1.28 ms (warm) / 2.10 ms (cold) |
| Availability check, per request | 2.17 ms | 1.13 ms (warm) / 1.51 ms (cold) |
| 200 availability requests at concurrency 100 | 447 ms wall, 447 req/s | 240 ms wall, 834 req/s |
| p50 / p95 under that load | 426 ms / 447 ms | 219 ms / 235 ms |

Throughput roughly doubled and median latency halved on the identical machine
and dataset. These are a single Node process against a local SQLite file, so the
absolute figures say nothing about a hosted database — the ratio is the result.

### Query plans

Corroboration from SQLite's own planner, for the same schema as each revision
defines it:

| Query | Before | After |
| --- | --- | --- |
| Expired-hold sweep (`status`, `hold_expires_at`) | `SCAN appointments` | `SEARCH appointments USING INDEX idx_appointments_status_hold` |
| Availability overlap | `SCAN appointments` | `MULTI-INDEX OR` → `idx_appointments_status_start` |
| Blocked-period overlap | `SCAN blocked_periods` | `SEARCH blocked_periods USING INDEX idx_blocked_periods_start_end` |
| Services for an appointment | `SCAN appointment_services` | `SEARCH appointment_services USING INDEX idx_appointment_services_appointment` |
| Notification feed (`ORDER BY created_at DESC`) | `SCAN` + `USE TEMP B-TREE FOR ORDER BY` | index-ordered scan, no sort |

### Rendering

`npm run build` now reports the homepage as **`○ Static` with `Revalidate 1m`**
where it was previously `ƒ Dynamic`. That is the change that lets a CDN absorb
the traffic instead of the origin rendering it.

### Extrapolation for 100,000 visits

Labelled as arithmetic, not measurement, and assuming every visit is a homepage
view — the worst case:

- Before: 6 statements and 1 write per visit → **600,000 statements and 100,000
  write transactions per day** for a menu that changes when the owner clicks
  Save.
- After: the page is served from cache and re-rendered at most once a minute →
  about **1,440 renders and 1,440 reads per day**, and the expired-hold sweep
  runs on its own schedule rather than per request.

## What changed

### The write came off the read paths

`cleanupExpiredHolds()` is unchanged and still exact — the owner dashboard and
the exported function sweep on demand. What changed is that the *read* paths now
call `sweepExpiredHoldsOpportunistically()`, which runs the sweep at most once
per 60 seconds per process and never concurrently.

This is safe because every overlap predicate already ignores a lapsed hold:
`status = 'PENDING' AND hold_expires_at > ?` cannot reserve an interval past its
expiry, whether or not the row has been tidied. To keep what a customer is *told*
exact between sweeps, `getAppointmentByReference` derives the effective status —
a pending request past its hold is reported as cancelled — without writing.

### Constant data is cached

`lib/server-cache.ts` is a bounded, in-process TTL cache (60 s) with tag
invalidation and single-flight de-duplication, so a burst of concurrent traffic
on a cold key produces one database read rather than one per request.

It is deliberately *not* `unstable_cache`. That stores results in Next's
incremental cache, which persists under `<distDir>/cache` across restarts and
deploys — meaning a database restored from backup, or reset by the test suite,
would keep being shadowed by a snapshot nothing in the app could clear.

The trade-off, stated plainly: the cache is per instance. A mutation invalidates
the instance that handled it immediately, and every other instance within the
60-second TTL. For a single server — and for a salon's traffic — that is exact in
practice. `lib/server-cache.ts` documents the full reasoning.

A second rule is enforced throughout: **write paths read live**. Caching the
hold duration, slot interval, or buffer would let a booking be accepted under a
rule the owner had already changed, so `createBookingRequest` uses
`readBookingSettingsLive()` and re-reads opening hours itself.

### The homepage is prerendered again

`app/page.tsx` replaced `export const dynamic = "force-dynamic"` with
`export const revalidate = 60`. The owner's service routes already called
`revalidatePath("/")`; they now also drop the catalogue cache tag, so an edit is
visible on the next visit rather than after the window.

The previous `force-dynamic` guarded a real case: a build machine with no
database, where a prerendered page could bake in "the menu could not be loaded".
That risk is now **bounded rather than removed** — `loadCatalogue` still catches
the failure and renders the honest unavailable state, and it is replaced within
the revalidate window once the database is reachable. This is a deliberate
change of a documented decision, made because per-request rendering of a
marketing page is the single largest avoidable cost at this traffic level.

The menu also stopped calling `getBookingRules()`. It needs one boolean — whether
any price has been reviewed — and that is a property of the catalogue rows it
already holds, so it now reads the cached catalogue and nothing else.

### Indexes and sargable predicates

`lib/db.ts` gained four indexes (`appointments(status, hold_expires_at)`,
`appointments(status, start_time)`, `blocked_periods(start_time, end_time)`,
`appointment_services(appointment_id)`, `notification_logs(created_at DESC)`).

Every overlap test was rewritten from `NOT (end_time <= ? OR start_time >= ?)` to
the equivalent, sargable `start_time < ? AND end_time > ?`. The two select
identical rows; only the second gives the planner something to seek on. This
change is invisible in behaviour and is covered by the existing unit tests.

### Rate limiting is bounded and proxy-aware

`lib/rate-limit.ts` replaces three separate `Map<ip, number[]>` limiters whose
keys were never evicted and whose key came from the *first* `x-forwarded-for`
entry — the one value in that header a client fully controls. Sending a random
value per request yielded an infinite budget *and* leaked memory.

The new store has a hard key ceiling, sweeps expired windows, and reads the
client address from the hop the nearest trusted proxy actually observed
(`TRUSTED_PROXY_HOPS`, default 1). `booking/slots` and `booking/config` — the two
most expensive public endpoints, one of which had no limit at all — are now
limited. The budgets for read endpoints are deliberately loose (300 per 10
minutes): mobile carriers put many subscribers behind one address, and the
database cost of abuse is already bounded by the read cache.

Setting `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` moves the counter
to a shared store for a fleet. Without them it is per instance, which is exact
for a single server — and the limiter falls back to the in-process counter if the
shared store is unreachable, because an unreachable Redis must never take
bookings down.

### Owner dashboard and webhook

- The appointments list fetches every listed appointment's services in one
  `WHERE appointment_id IN (...)` statement and groups in memory: **251 round
  trips → 2**.
- The overview's seven sequential per-day queries became one indexed range scan,
  bucketed by salon-local date in memory — which also avoids depending on
  SQLite's date parsing to convert a stored UTC instant into an IST day.
- The WhatsApp webhook applies a whole callback's status updates in one batched
  write instead of one awaited statement each. This matters beyond speed: Meta
  re-delivers a callback that was not acknowledged in time, so a slow serial loop
  could amplify itself.
- Three routes that logged with bare `console.error` now use the structured
  logger, and the webhook's GET verify-token comparison is constant-time like its
  POST signature check.

### Cold start

`initDb` now records a `schema_version` marker in `owner_settings` and skips the
entire DDL and seed block when it matches. A warm database is recognised by one
indexed read instead of ~20 statements charged to whichever visitor arrived
first on a new serverless instance. **Bump `SCHEMA_VERSION` in `lib/db.ts` whenever
the schema or seed catalogue changes**, or existing deployments will silently
miss the change.

### Delivered to the browser

- The booking wizard is no longer in the homepage's initial JavaScript. It was
  statically imported by every service card, so the whole five-step wizard, its
  calendar, its slot grid, and the modal animation runtime were downloaded and
  parsed by visitors who never opened it. It is now `next/dynamic`.
- The hero no longer animates its two LCP candidates from `opacity: 0`. A
  browser does not treat a fully transparent element as a rendered LCP
  candidate, so fading in the headline and the preloaded hero image deferred LCP
  behind JavaScript download, hydration, and the animation itself. Both are now
  moved with `transform` only; the supporting copy keeps its fade.
- `priority` → `preload` on the hero image (deprecated in Next 16), and removed
  from the gallery lightbox image, where it disabled lazy loading and set high
  fetch priority on an image that only exists after a click.
- The gallery's `sizes` claimed `100vw` on mobile for a 162 px tile, asking for
  the 1200 px candidate — roughly six times the pixel area needed, on every tile.
- `next.config.ts` no longer generates the 2048 and 3840 device sizes, which this
  layout can never request, and holds optimized derivatives for a week rather
  than the four-hour default.

## Verification actually run

```
npx tsc --noEmit              → exit 0
npm run lint                  → exit 0, 0 problems
npm test                      → 18 tests, 18 pass, 0 fail
npm run build                 → exit 0, 22 routes; "/" is Static, Revalidate 1m
npm run bench                 → see the tables above
```

`npm run build` and `npx playwright test` cannot run inside the DSH file sandbox:
Next's TypeScript worker is refused piped child-process stdio (`spawn EPERM`).
The build was run with wider access instead, as recorded in `PROJECT_STATE.md`.

The unit suite needed one change to stay honest: it writes raw SQL directly to
the database, bypassing the owner routes that invalidate the cache, so its direct
writes go through a small `rawDb()` helper that clears the cache afterwards.
Clearing only ever forces a live read, so this cannot mask a defect.

## Deliberately not changed

- **`MotionProvider` stays in the root layout.** It pulls `motion/react` — the
  whole of framer-motion, ~140 KB — into the shared bundle, so `/owner` and
  `/owner/login` load an animation runtime they never use. It was left alone
  because those are single-operator routes, the traffic there is one person, and
  the provider is what implements `reducedMotion="user"`. Removing it would trade
  a real accessibility guarantee for a bundle saving on pages no customer visits.
  The customer routes (`/`, `/book`, `/book/status`) already need Motion for the
  mobile menu, the wizard, and the gallery lightbox.
- **The ~800 KB source JPEGs were not re-encoded.** They are roughly 3–5× the
  size a well-encoded JPEG of that resolution would be, but they are the owner's
  assets and are documented as illustrative placeholders awaiting replacement.
  Silently re-encoding them would change files the owner is responsible for, and
  the per-visit cost is already carried by the image optimizer's AVIF/WebP
  derivatives rather than by the originals.
- **`/book` was not converted to server-rendered props.** It is still
  `force-dynamic`, and its first step waits on a client fetch of
  `/api/booking/config` (twice per session). This is a worthwhile follow-up —
  roughly two round trips and one duplicate query chain per booking session — but
  it means moving the wizard's data loading from `BookingWizard` into a server
  component, which is a larger refactor than this pass covered and carries real
  regression risk in the most important funnel on the site.
- **The owner dashboard still fetches all seven endpoints on mount.** It fires
  every tab's request regardless of which is visible. Worth fixing, but it is one
  operator loading one page, so it does not affect the traffic target.

## Known limits, stated honestly

- **The read cache is per instance.** Invalidate-on-write is exact only on the
  instance that served the mutation; others converge within 60 seconds.
- **Rate limits are per process unless a shared store is configured.** A fleet
  without `UPSTASH_REDIS_REST_*` gets `limit × instances`.
- **Read-endpoint rate limits are loose on purpose**, so they will not stop a
  distributed attack. They bound accidental and single-source load; the read
  cache bounds the database cost.
- **The homepage can serve up to 60 seconds of stale menu**, or a stale
  "unavailable" state after a build with no reachable database. Both self-heal.
- **Notifications are still fire-and-forget.** The WhatsApp send is deliberately
  off the customer's request path, but it is a detached promise, not a durable
  queue: on serverless the instance can be recycled before the send completes,
  and the attempt would be recorded as `SENDING` with no outcome. A transactional
  outbox — writing the intent inside the booking transaction and draining it on a
  schedule — is the correct fix and is not implemented here.
- **`/book` is still `force-dynamic`** and its first step is gated behind a
  client fetch, twice per session. Server-rendering that data would remove two
  round trips per booking session and is a worthwhile follow-up; it is a larger
  refactor of `BookingWizard` than this pass covered.
- **The owner dashboard still fetches all seven endpoints from the client** on
  load regardless of the visible tab.
- **No browser measurement was taken.** LCP and bundle claims above are reasoned
  from the code and Next 16's bundled documentation, not from Lighthouse or a
  real device. Nothing here should be restated as a measured Core Web Vital.
- **The seeded 4,000-appointment database is synthetic.** It is large enough for
  the indexes to matter and its row shape matches production, but it is not a
  replay of real traffic.
