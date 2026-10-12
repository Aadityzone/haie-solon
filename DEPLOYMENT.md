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
| `DATABASE_URL` | `file:./salon.db` for a local file, or `libsql://…` for hosted Turso. |
| `DATABASE_AUTH_TOKEN` | Required for hosted Turso. Not needed for a local file. |

### Optional

| Variable | Purpose |
| --- | --- |
| `SALON_DB_PATH` | Overrides the local SQLite file location when `DATABASE_URL` is unset. |
| `OWNER_PASSWORD` | Bypasses the database password and authenticates against this value directly. Useful for a managed platform; leave unset if you want the password stored hashed in the database. |

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

There is no separate migration tool. `initDb()` runs on the first database access
and applies an idempotent schema:

- `CREATE TABLE IF NOT EXISTS` for `services`, `salon_hours`, `blocked_periods`,
  `appointments`, `appointment_services`, `notification_logs`, `owner_settings`.
- Additive `ALTER TABLE` guards for later columns (`appointments.whatsapp_opt_in`,
  `notification_logs.provider_message_id`, `services.image_url`).
- Seeding only when a table is empty: seven days of opening hours, a proposed
  service catalogue, and default booking rules.

Seeded services are **inactive with no price**. The proposed figures live in
`config/service-catalogue.ts` and are shown to the owner as suggestions; they are
never published until the owner sets a price and enables the service.

`salon.db` is gitignored and must never be committed — it holds real customer
records.

### Choosing a database

| Hosting | Database |
| --- | --- |
| Single long-lived server or VM | Local `file:./salon.db` is fine. Back it up (below). |
| Vercel/serverless, or more than one instance | Hosted Turso. A local file does not work: each instance would get its own copy. |

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
npm test                    # unit tests (booking, privacy, notifications)
npm run test:e2e            # Playwright: builds, starts, and drives a real browser
npm run build               # production build
npm start                   # serve the production build
```

`npm run test:e2e` builds and starts its own server on port 3210 against an
isolated database in `.playwright/`, so it never touches `salon.db`. Override the
port with `PLAYWRIGHT_PORT` if 3210 is taken.

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
6. **Replace the rate limiter** if you run more than one instance. Rate limits are
   currently in-process `Map`s, which is correct for a single instance and
   per-instance for a fleet.

## 11. Known limitations

- **Rate limiting is per process.** A multi-instance deployment needs a shared
  store (Redis, Upstash, or the platform's edge limiter) before it can be relied
  on against abuse.
- **The local SQLite file does not work on serverless hosting.** Use Turso.
- **No email channel.** Customer notices are WhatsApp-only, and only for
  customers who opted in.
- **Notifications are fire-and-forget.** A provider outage cannot fail a booking,
  which is intentional, but it also means a notification failure is only visible
  in the dashboard log rather than retried indefinitely.
- **The homepage menu is statically cached with a 60-second revalidate window**,
  refreshed immediately whenever the owner saves a service.
- **No automated off-site backups are configured.** See section 9.

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
  and ignores duplicate or out-of-order status updates.
- Login and booking endpoints are rate limited, and server errors are logged with
  phone numbers redacted and generic messages returned to the client.
