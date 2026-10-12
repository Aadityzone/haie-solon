# Product context

## Product

A local unisex hair salon website and appointment request system for a salon in Patiala, Punjab, India. Customers can explore a provisional service menu, request a time, and check the request by a high-entropy booking reference. The owner uses a password-protected portal to review requests and manage services, opening hours, blocked periods, and booking rules.

## Verified facts and content rules

- Configured public name is `Your Salon Name`, a placeholder pending the salon's official name.
- Configured phone and WhatsApp click-to-chat contact is `+91 62808 66359`.
- City and state are Patiala, Punjab. The exact street address and opening hours are unconfirmed.
- Service list, descriptions, prices, durations, gallery photos, and interior photos are provisional or illustrative until verified by the owner.
- Do not invent reviews, credentials, years, awards, policies, addresses, hours, or confirmed appointment status.
- Appointment submissions remain pending until owner approval. A WhatsApp link is not evidence of automated message delivery.

## Architecture

- Next.js App Router with React and TypeScript.
- Tailwind CSS v4, GSAP for scoped editorial entrance effects, and Motion for local interactions.
- SQLite/libSQL persistence using `@libsql/client` and runtime schema setup in `lib/db.ts`.
- Server API routes validate and persist appointment requests, recalculate service price/duration from active database records, and check time conflicts.
- Owner pages and mutations use the existing server-side session/auth implementation.
- WhatsApp Cloud API delivery is optional, server-side, template-based, and configuration-dependent.

## Audience and success

Local customers should understand the salon's offer, request a suitable time, and know whether it is still pending. The owner should be able to manage appointments and availability without exposing customer data to public routes.
