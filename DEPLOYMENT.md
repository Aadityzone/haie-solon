# Deployment and handover

Everything needed to take this project from the repository to a live salon site.
No secrets appear in this file — every credential is referenced by variable name
only.

## 1. What this application is

A Next.js (App Router) site with a real appointment **request** system and a
password-protected owner portal. Requests are `PENDING` until the owner approves
them; nothing in the UI presents a request as a confirmed appointment, and no
price reaches a customer until the owner sets it on a service.

| Area | Route |
| --- | --- |
| Public site (home, services, gallery, about, contact) | `/` |
| Booking request | `/book` |
| Booking status lookup | `/book/status` |
| Owner sign-in | `/owner/login` |
| Owner dashboard | `/owner` |

## 2. Prerequisites

- Node.js 20 or newer and npm.
- A libSQL database: either a local SQLite file (single instance only) or a
  hosted Turso database (required for serverless or multi-instance hosting).
- A WhatsApp Business Platform (Cloud API) account **only if** automated
  notifications are wanted. The site works fully without it.

## 3. Environment variables

Copy `.env.example` to `.env.local` for local work, or set these in your hosting
provider's environment settings. `.env*` files are gitignored; never commit a
real value.

### Required

| Variable | Purpose |
| --- | --- |
| `AUTH_SECRET` | Signs owner session cookies. Generate a long random value (32+ chars). The app **refuses to start authenticated sessions in production** without it. |
| `OWNER_SETUP_TOKEN` | One-time token that authorises creating the first owner password at `/owner/login`. Remove it from the environment once the password exists. |
| `DATABASE_URL` | `file:./salon.db` for a local file, or `libsql://…` for hosted Turso. **`file:` is local-only and must not be used on serverless hosting.** |
| `DATABASE_AUTH_TOKEN` | Required for hosted Turso. Not needed for a local file. |

### Database aliases

`DATABASE_URL` wins when more than one is present. These alternatives exist
because the Turso CLI and Vercel's Turso integration set different names for the
same values, and a deployment that sets only those names used to fall back to an
unusable local file:

| Variable | Purpose |
| --- | --- |
| `TURSO_DATABASE_URL` | Alias for the hosted URL. |
| `TURSO_AUTH_TOKEN` | Alias for the database token. |
| `LIBSQL_URL` | Alias for the hosted URL only. |

### Serverless deployments

A local `file:` database **cannot** work on Vercel or any other serverless host:
the deployment bundle is read-only, and each function instance gets its own
temporary filesystem, so the catalogue would be unreadable in one instance and
absent in the next. The fallback is still resolved rather than refused, because a
build machine may legitimately have no database — refusing there would make a
misconfigured environment undeployable instead of merely broken.

The failure therefore surfaces at query time, and it is named there. Every route
that reads the database (`booking.services`, `booking.config`, `booking.slots`,
`booking.create`, `booking.status`) and the homepage menu
(`home.service-menu`) logs one structured line carrying `databaseSource` (which
variable supplied the URL, or `missing`), `databaseMode` (`hosted` or
`local-file`), `databaseHost`, and `databaseError` — never a token, and never a
URL with credentials. When the file cannot be opened, `databaseError` says so in
words:

```
{"level":"error","scope":"booking.services","message":"ConnectionFailed(...: 14)",
 "databaseSource":"local-default","databaseMode":"local-file",
 "databaseError":"libSQL could not open the database (SQLite error 14, SQLITE_CANTOPEN).
  In production this means no hosted database is configured and the local file cannot be used."}
```

`databaseSource: "missing"` or `"local-default"` in a production log means the
hosted database variables did not reach the runtime. A `databaseSource` of
`DATABASE_URL` with a `databaseHost` means the URL arrived and the failure is the
URL or the token itself.

### How the homepage is rendered

`app/page.tsx` sets `export const revalidate = 60`, so the homepage is
prerendered and revalidated rather than rendered per request.

Freshness is preserved two ways. The catalogue read is cached and tagged, and the
owner's service routes call `revalidatePath("/")` and drop that tag, so a saved
service is visible on the next visit rather than after the window. The window
covers a change that arrives without going through those routes — a database
restored from backup, or another instance serving its own cached copy.

This replaced `dynamic = "force-dynamic"`, which existed to stop a build machine
with no database from baking "the menu could not be loaded" into static HTML.
That risk is now bounded rather than removed: the menu component still catches
the failure and renders the honest unavailable state, and it is replaced within
the revalidate window once the database is reachable. Per-request rendering of a
marketing page was the largest avoidable cost at production traffic, which is why
the trade was made. `PERFORMANCE.md` has the measurements.


### Optional

| Variable | Purpose |
| --- | --- |
| `SALON_DB_PATH` | Overrides the local SQLite file location when `DATABASE_URL` is unset. |
| `OWNER_PASSWORD` | Bypasses the database password and authenticates against this value directly. Useful for a managed platform; leave unset if you want the password stored hashed in the database. |
| `UPSTASH_REDIS_REST_URL` | Shared rate-limit store, for a multi-instance or serverless deployment. See section 11. |
| `UPSTASH_REDIS_REST_TOKEN` | Token for the above. |
| `TRUSTED_PROXY_HOPS` | How many proxies in front of the app append to `x-forwarded-for`. Default `1` (a single edge or load balancer). Set `0` only when the app is exposed directly, which makes every caller share one rate-limit bucket. |
| `BOOKING_RATE_LIMIT_MAX` | Raises the booking-creation budget. Clamped to 10,000; intended for test servers only. |

### WhatsApp (all optional; notifications are skipped until every one is set)

| Variable | Purpose |
| --- | --- |
| `WHATSAPP_API_TOKEN` | Cloud API access token. |
| `WHATSAPP_PHONE_NUMBER_ID` | Sender phone number ID. |
| `WHATSAPP_API_VERSION` | Graph API version, e.g. `v26.0`. |
| `WHATSAPP_TEMPLATE_LANGUAGE` | Template language code, default `en_US`. |
| `WHATSAPP_TEMPLATE_NEW_REQUEST` | Approved template name for a new request (owner). |
| `WHATSAPP_TEMPLATE_CONFIRMED` | Approved template name for an approval (customer). |
| `WHATSAPP_TEMPLATE_REJECTED` | Approved template name for a rejection (customer). |
| `WHATSAPP_TEMPLATE_CANCELLED` | Approved template name for a cancellation (customer). |
| `WHATSAPP_OWNER_RECIPIENT` | Owner's WhatsApp number for production alerts. |
| `WHATSAPP_DEV_RECIPIENT` | Test recipient, used **only** outside production. Never point this at the owner. |
| `WHATSAPP_APP_SECRET` | Meta app secret, used to verify webhook signatures. |
| `WHATSAPP_WEBHOOK_VERIFY_TOKEN` | Token Meta echoes during webhook subscription. |

Each approved template must accept exactly seven body parameters, in order:
reference, customer name, services, local appointment time, duration, price,
reason.

## 4. Database setup and schema

### Pointing production at a hosted database (Turso)

This is the step that a Vercel deployment is most likely to be missing, and the
symptom is `/api/booking/services` answering `500 {"success":false,"error":"Failed
to load services"}`.

1. Create the database: `turso db create <name>` (or use any libSQL provider).
2. Read the connection URL: `turso db show <name> --url` → `libsql://<name>-<org>.turso.io`.
3. Create a token: `turso db tokens create <name>`.
4. In Vercel → Project → Settings → Environment Variables, add for **Production,
   Preview, and Development**:
   - `DATABASE_URL` = the `libsql://…` URL
   - `DATABASE_AUTH_TOKEN` = the token
   - `AUTH_SECRET` = a long random value
   - `OWNER_SETUP_TOKEN` = a private one-time value
   (or the equivalent `TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN` pair)
5. Redeploy so the new variables reach the running functions.
6. Confirm: `GET /api/booking/services` must return `{"success":true,"services":[…]}`
   with the catalogue, and `/book` must show step 1 with service cards.
7. Open `/owner/login` and create the owner password, then remove
   `OWNER_SETUP_TOKEN` from the environment.

The schema and the standard service catalogue are created automatically on the
first successful database access — there is no separate migration command to run.

There is no separate migration tool. `initDb()` runs on the first database access
and applies an idempotent schema:

- `CREATE TABLE IF NOT EXISTS` for `services`, `salon_hours`, `blocked_periods`,
  `appointments`, `appointment_services`, `notification_logs`, `owner_settings`.
- Additive `ALTER TABLE` guards for later columns (`appointments.whatsapp_opt_in`,
  `notification_logs.provider_message_id`, `services.image_url`,
  `services.price_verified`).
- Seven days of opening hours and the default booking rules are seeded only when
  their tables are empty.
- The standard service catalogue is installed as ordinary, owner-editable rows:
  the proposed price is used as the starting price, and `services.price_verified`
  stays `0` so every customer surface labels that figure as **proposed** until the
  owner saves the row. An existing row is never force-enabled or re-priced.

`salon.db` is gitignored and must never be committed — it holds real customer
records.

### Choosing a database

| Hosting | Database |
| --- | --- |
| Single long-lived server or VM | Local `file:./salon.db` is fine. Back it up (below). |
| Vercel/serverless, or more than one instance | Hosted Turso. A local file does not work: the bundle is read-only and each instance would get its own copy. |

## 5. Owner account initialisation

1. Set `AUTH_SECRET` and a private `OWNER_SETUP_TOKEN`.
2. Deploy (or run locally) and open `/owner/login`.
3. The page detects that no owner password exists and asks for the setup token
   plus a new password (minimum 8 characters).
4. After sign-in, **remove `OWNER_SETUP_TOKEN` from the environment**. Setup is
   refused once a password exists, but removing it removes the surface entirely.
5. Work through the dashboard: confirm services and prices, opening hours and
   breaks, blocked times, and booking rules.

## 6. WhatsApp setup

1. Create a WhatsApp Business Platform app and note the phone number ID, access
   token, and app secret.
2. Create and get approval for four message templates matching the event names
   above, each with the seven body parameters in order.
3. Set the credentials and template names in the environment. Use
   `WHATSAPP_DEV_RECIPIENT` while testing — it is ignored in production.
4. Configure the webhook callback URL as
   `https://<your-domain>/api/webhooks/whatsapp`, set the verify token, and
   subscribe to message **status** updates so delivery is recorded.
5. Send an authorized test request and confirm the dashboard's **Notifications**
   tab shows real provider states.

Until step 3 is complete, every attempt is recorded as `SKIPPED` with its reason.
A successful API response is recorded as `ACCEPTED`, which means *accepted for
processing* — not delivered. Delivery appears only when the signed status webhook
reports it.

## 7. Build, test, and run

```bash
npm install                 # install dependencies
npm run lint                # ESLint, must be clean
npx tsc --noEmit            # type check
npm test                    # unit tests (booking, privacy, notifications, cache)
npm run test:e2e            # Playwright: builds, starts, and drives a real browser
npm run build               # production build
npm start                   # serve the production build
npm run bench               # load benchmark; writes nothing, uses a temp database
```

`npm run test:e2e` builds and starts its own server on port 3210 against an
isolated database in `.playwright/`, so it never touches `salon.db`. Override the
port with `PLAYWRIGHT_PORT` if 3210 is taken.

`npm run bench` seeds a temporary database with 4,000 appointments and reports
the database statements and latency per request shape. Set `SALON_BENCH_ROOT` to
measure a different checkout with the same instrumentation, and see
`PERFORMANCE.md` for the recorded before/after figures.

## 8. Hosting and domain

- Any Node host that can run `next start`, or a Next.js-aware platform.
- Set all required environment variables in the platform, not in the repository.
- Point the domain at the host and enable HTTPS. Session cookies switch to
  `Secure` automatically when `NODE_ENV=production`, so **HTTPS is required** or
  the owner will not stay signed in.
- The owner portal lives at `/owner`; there is no public sign-up route.

## 9. Backup and recovery

- **Local SQLite:** stop writes (or accept a hot copy), then copy `salon.db`
  along with any `salon.db-wal` / `salon.db-shm` files. Schedule it. Test a
  restore into a scratch directory before you need it.
- **Turso:** use the platform's point-in-time restore or `turso db dump`, and
  verify the restore procedure.
- There is no in-app delete-all or reset control, and no destructive migration
  runs on startup, so a restore is only needed for host-level failures or
  accidental data edits by an owner.
- Appointment price and duration snapshots are stored per appointment, so a
  catalogue change never rewrites history.

## 10. Remaining manual steps before accepting real bookings

1. **Replace the placeholders** in `config/salon.ts`: salon name, street address,
   Google Maps link, email, and social handles. Opening hours are managed in the
   dashboard, and the `hours.confirmed` flag gates the public display.
2. **Confirm the service catalogue** with the owner: names, descriptions,
   durations, and prices. Enable only the confirmed ones.
3. **Approve the photography.** The images in `public/images/` are illustrative
   and the UI labels them as such. Remove those labels only once the owner
   confirms the images are theirs.
4. **Set the booking rules** — hold duration, booking window, slot interval, and
   buffer — to match how the salon actually works.
5. **Complete the WhatsApp setup** (section 6) if automated notifications are
   wanted.
6. **Set `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`** if you run more
   than one instance, so the rate limits are shared rather than per process. For a
   single server, leave them unset; the in-process limiter is exact there.

## 11. Known limitations

- **Read caches are per instance.** The service catalogue, opening hours, and
  booking rules are cached in-process for 60 seconds. A mutation invalidates the
  instance that handled it immediately, and every other instance within the TTL,
  so a single-server deployment is exact. This is deliberate — see
  `lib/server-cache.ts` for why Next's persistent cache was rejected here.
- **Rate limiting is per process unless a shared store is configured.** Set
  `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` for a fleet; without
  them a deployment of N instances allows N times the configured budget and a
  cold start resets it. If the shared store is unreachable the app falls back to
  the in-process counter rather than failing requests.
- **Read-endpoint rate limits are deliberately loose.** The availability and
  configuration endpoints allow 300 requests per 10 minutes per address, because
  mobile carriers put many subscribers behind one address through CGNAT. They
  bound accidental and single-source load, not a distributed attack; the database
  cost of abuse is bounded by the read cache.
- **The local SQLite file does not work on serverless hosting.** Use Turso.
- **No email channel.** Customer notices are WhatsApp-only, and only for
  customers who opted in.
- **Notifications are fire-and-forget.** A provider outage cannot fail a booking,
  which is intentional, but the send is a detached promise rather than a durable
  queue: on serverless the instance can be recycled before it completes, leaving
  the attempt recorded as `SENDING` with no outcome. A transactional outbox is the
  correct fix and is not implemented.
- **The homepage menu can be up to 60 seconds stale**, or briefly serve an
  "unavailable" state after a build with no reachable database. Both self-heal,
  and an owner's save is picked up on the next visit.
- **`/book` is still rendered per request**, and its first step waits on a client
  fetch. Server-rendering that data would remove two round trips per booking
  session.
- **No automated off-site backups are configured.** See section 9.

`PERFORMANCE.md` records what was measured, how, and what remains.

## 12. Security notes

- Owner passwords are hashed with scrypt and a per-hash salt; verification is
  timing-safe.
- Session cookies are `HttpOnly`, `SameSite=Lax`, `Secure` in production, signed
  with HMAC-SHA256, and expire after seven days.
- Every `/api/owner/*` route requires a valid session server-side; hiding UI is
  never the authorisation boundary.
- Customer status lookup requires the booking reference **and** the mobile number
  used for the booking. A wrong reference and a wrong number return the same
  answer, so neither confirms the other exists.
- The WhatsApp webhook verifies `x-hub-signature-256` with a timing-safe compare
  and ignores duplicate or out-of-order status updates. Its GET verify-token
  comparison is constant-time too.
- Booking creation, status lookup, the availability and configuration endpoints,
  and owner sign-in are all rate limited. Budgets live in one place,
  `RATE_LIMITS` in `lib/rate-limit.ts`. The limiter bounds its own memory and
  reads the client address from the hop the nearest trusted proxy observed,
  rather than from the first `x-forwarded-for` entry a caller can forge.
- Server errors are logged with phone numbers redacted and generic messages
  returned to the client.
