"use client";

import { MotionConfig } from "motion/react";
import type { ReactNode } from "react";

/**
 * Applies the visitor's motion preference to every Motion (Framer Motion)
 * component at once.
 *
 * Motion does NOT read `prefers-reduced-motion` by default: its
 * `MotionConfig` defaults to `reducedMotion: "never"`, so JavaScript-driven
 * animations from Motion (the mobile menu, the booking dialog, the gallery
 * lightbox) would keep running even when the visitor asked for less motion.
 * The global CSS `@media (prefers-reduced-motion: reduce)` rule only reaches
 * CSS animations and transitions, not Motion's inline-driven animations.
 *
 * `reducedMotion="user"` makes Motion defer to the operating-system setting:
 * transform and layout animations are skipped while opacity/colour changes
 * remain, which keeps state changes legible without movement.
 *
 * GSAP is unaffected: the GSAP components read the same media query
 * themselves and skip their timelines under reduced motion. No element is
 * animated by both systems.
 *
 * `MotionConfig` renders only a React context provider, no DOM element, so it
 * is safe to wrap the whole document in the server-rendered root layout.
 */
export default function MotionProvider({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
