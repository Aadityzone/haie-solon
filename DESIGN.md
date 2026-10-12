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

Use GSAP only for scoped, reversible reveal timelines and Motion only for local interactive transitions. Respect reduced motion. Do not animate the same property with both systems. Existing local photography is illustrative until the owner approves it as salon imagery; keep that distinction visible.

## Product constraints

Keep the configured salon name and contact. Never publish proposed prices as confirmed. Preserve booking references, API behavior, server-derived service totals, authentication, database records, and the pending-approval language.
