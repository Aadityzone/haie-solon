# Design direction

## Customer pages: persuade

Dark luxury editorial for a local unisex salon: cinematic graphite, warm cream type, muted champagne accents, generous negative space, carefully cropped salon photography, and a composed serif/sans hierarchy. The scene should feel intimate and tactile rather than like a dashboard or generic salon template.

## Owner pages: operate

Use the same dark materials and type system, with clearer dense information, stable controls, obvious statuses, and strong contrast. Express the brand through precise accents and borders, not decorative animation.

## Tokens

- Base `#0A0A0B`, surface `#111113`, elevated `#18181B`, border `#303034`.
- Text `#F2EEE7`, secondary `#A7A19A`, champagne `#C6A875`, muted bronze `#8E7048`.
- Serif display with a system serif fallback; system sans for body and controls.
- Editorial spacing, mostly square edges, thin rules, image-led layouts, minimal shadows.
- Design variance 7/10, motion intensity 4/10, visual density 3/10 on public pages.

## Motion and media

Motion is split between two libraries with a deliberate, non-overlapping split of
ownership. Pick the library by *what the animation is*, never by familiarity, and
never run both on the same element or property.

| Use | Library | Where it lives today |
| --- | --- | --- |
| Cinematic, orchestrated page entrance | GSAP | `components/ui/hero-3.tsx` — one `gsap.timeline()` for the hero copy, then the visual column |
| Scroll-triggered section reveals | GSAP + ScrollTrigger | `components/Gallery.tsx`, `components/ServiceHighlights.tsx` — scoped, `once: true`, reversible via `gsap.context().revert()` |
| Component transitions, overlays, presence | Motion for React | `components/Navbar.tsx` (mobile menu), `components/booking/BookingDialog.tsx`, `components/Gallery.tsx` (lightbox) |
| Hover/focus feedback, small state changes | Motion for React (`motion.span`/`motion.a`) | the mobile hamburger, menu links |

Rules:

- **One owner per element.** A component animated by a GSAP timeline or
  ScrollTrigger must not also carry a Motion `animate`/`initial`/`exit` on the
  same node. The gallery keeps this clean: GSAP owns the header and grid reveal,
  Motion owns the lightbox overlay.
- **GSAP is client-only and scoped.** Register plugins once at module scope, wrap
  every effect in `gsap.context(..., rootRef)` so selectors cannot leak, and call
  `context.revert()` in the cleanup to kill timelines and ScrollTriggers on
  unmount. The hero sets its start state in a layout effect so there is no
  first-frame flash.
- **Motion respects the visitor's OS choice.** `components/MotionProvider.tsx`
  wraps the app in `<MotionConfig reducedMotion="user">`. Motion defaults to
  `"never"`, so this provider is what makes it honour `prefers-reduced-motion`.
  Do not set `reducedMotion` back to `"never"` on a local `MotionConfig`.
- **Reduced motion is mandatory.** CSS handles transitions and the marquee;
  `MotionConfig` handles Motion; each GSAP effect copies the
  `prefers-reduced-motion: reduce` guard and returns before creating a timeline.
  The final, fully visible state is the correct reduced-motion state.
- **Never gate the primary action.** Booking links and buttons are ordinary links
  and buttons; animation may decorate them but must not delay or intercept them.
  Keyboard focus behaviour is unchanged by any animation.

Existing local photography is illustrative until the owner approves it as salon
imagery; keep that distinction visible.

## Product constraints

Keep the configured salon name and contact. Never publish proposed prices as confirmed. Preserve booking references, API behavior, server-derived service totals, authentication, database records, and the pending-approval language.
