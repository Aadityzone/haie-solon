"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import gsap from "gsap";

/**
 * `useLayoutEffect` runs after hydration but before the browser paints, so GSAP
 * can set an entrance's start state in the same frame React commits, rather than
 * a paint later. It does not remove the gap between the server's HTML arriving
 * and React hydrating — nothing on the client can, and Next's own guidance says
 * so: `useLayoutEffect` "prevents the flash between hydration and paint, but not
 * the flash between the HTML arriving and React hydrating".
 *
 * Because that gap cannot be closed, the entrance below is built so that a
 * transiently visible-then-translated hero is not a defect: nothing a visitor's
 * first paint depends on is animated from `opacity: 0`.
 *
 * The server has no DOM, so it falls back to `useEffect` there.
 */
const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

/** Cinematic salon introduction. All imagery is illustrative until owner approved. */
export default function AnimatedMarqueeHero() {
  const rootRef = useRef<HTMLElement>(null);
  const [marqueePaused, setMarqueePaused] = useState(false);

  useIsomorphicLayoutEffect(() => {
    const root = rootRef.current;
    if (!root || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const context = gsap.context(() => {
      // One orchestrated timeline for the hero: the copy settles first, then the
      // visual column follows while the copy is still finishing. Scoped to the
      // hero root and reverted on unmount, so no timeline or inline style leaks
      // into the rest of the page.
      //
      // The two elements that can be the Largest Contentful Paint — the headline
      // and the preloaded hero image — are moved with `transform` only, never
      // faded in from `opacity: 0`. A browser does not treat a fully transparent
      // element as a rendered LCP candidate, so fading either one in defers LCP
      // until after the JavaScript has downloaded, hydrated, and animated:
      // exactly the work an entrance animation is supposed to be invisible
      // against. Translation changes no pixel's visibility, so the paint that
      // establishes LCP happens on the first frame regardless of when the
      // animation starts. The supporting copy keeps its fade; it is never the
      // largest element on the page.
      const timeline = gsap.timeline({ defaults: { ease: "power3.out" } });
      timeline
        .fromTo(
          "[data-hero-copy]:not(#hero-title)",
          { opacity: 0, y: 18 },
          { opacity: 1, y: 0, duration: 0.8, stagger: 0.1 },
        )
        .fromTo("#hero-title", { y: 22 }, { y: 0, duration: 0.8 }, 0)
        .fromTo("[data-hero-visual]", { y: 24 }, { y: 0, duration: 0.9 }, "-=0.5");
    }, root);
    return () => context.revert();
  }, []);

  return (
    <section ref={rootRef} id="home" aria-labelledby="hero-title" className="relative overflow-hidden bg-background pt-28 sm:pt-32 lg:pt-36">
      <div className="mx-auto grid max-w-[1440px] items-center gap-10 px-5 pb-12 sm:px-8 lg:grid-cols-[0.9fr_1.1fr] lg:gap-14 lg:px-12 lg:pb-16">
        <div className="relative z-10 max-w-2xl py-4 lg:py-12">
          <p data-hero-copy className="eyebrow">A hair studio in Patiala</p>
          <h1 id="hero-title" data-hero-copy className="mt-6 max-w-[13ch] font-[family-name:var(--font-serif)] text-[clamp(2.2rem,9vw,6.5rem)] leading-[1.02] tracking-[-0.035em] text-foreground sm:leading-[0.98]">
            Style that feels like <span className="text-champagne">you.</span>
          </h1>
          <p data-hero-copy className="mt-6 max-w-lg text-base leading-7 text-neutral-500 sm:text-lg sm:leading-8">
            A considered space for hair, care, and a little time to decide what feels right. Explore the provisional service menu or send an appointment request.
          </p>
          <div data-hero-copy className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link href="/book" className="btn-primary">
              Book an appointment <span aria-hidden="true">↗</span>
            </Link>
            <a href="#services" className="btn-secondary">Explore services</a>
          </div>
          <p data-hero-copy className="mt-5 max-w-sm text-xs leading-5 text-neutral-500">
            Requests are reviewed by the salon. Your time is held pending approval; submission is not a confirmation.
          </p>
        </div>

        <div data-hero-visual className="relative min-w-0 lg:pl-2">
          <div className="absolute -right-3 -top-3 h-[42%] w-[42%] border border-champagne/50 sm:-right-4 sm:-top-4" aria-hidden="true" />
          <div className="relative aspect-[4/3] overflow-hidden bg-elevated sm:aspect-[1.16/1]">
            {/* `preload` replaces the deprecated `priority` prop in Next 16. It
                inserts the preload link and keeps the image eager, which is
                right for the element that is the LCP candidate here. */}
            <Image src="/images/hero.jpg" alt="Illustrative cinematic salon interior; not a verified photograph of this business" fill preload sizes="(max-width: 1024px) 100vw, 56vw" className="object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-background/45 via-transparent to-transparent" aria-hidden="true" />
            <span className="absolute bottom-4 left-4 text-[0.7rem] uppercase tracking-[0.14em] text-foreground/80">Illustrative salon imagery</span>
          </div>
          <div className="mt-4 flex items-center justify-between border-t border-border pt-3 text-[0.7rem] uppercase tracking-[0.14em] text-neutral-500">
            <span>Hair · Care · Personal style</span><span>Patiala, Punjab</span>
          </div>
        </div>
      </div>

      <div className="border-y border-border/80 py-4" aria-label="Illustrative salon and hair photography">
        <div className="marquee-viewport">
          <div className="marquee-track" aria-hidden="true" style={{ animationPlayState: marqueePaused ? "paused" : undefined }}>
            {[0, 1].map(copy => <div key={copy} className="marquee-group">{[
              ["/images/gallery/gallery-2.jpg", "high"], ["/images/gallery/gallery-4.jpg", "low"], ["/images/about.jpg", "high"], ["/images/gallery/gallery-5.jpg", "low"],
            ].map(([src, position], index) => <div key={`${copy}-${index}`} className={`marquee-photo ${position === "high" ? "marquee-photo-high" : "marquee-photo-low"}`}><Image src={src} alt="" fill sizes="(max-width: 640px) 62vw, 28vw" className="object-cover" loading="lazy" /></div>)}</div>)}
          </div>
        </div>
        <div className="mx-auto mt-3 flex max-w-7xl items-center justify-between gap-4 px-5 sm:px-8 lg:px-12">
          <p className="text-[0.6rem] uppercase tracking-[0.12em] text-neutral-500">Illustrative imagery · not represented as salon client work</p>
          <button type="button" aria-pressed={marqueePaused} onClick={() => setMarqueePaused(value => !value)} className="min-h-11 shrink-0 text-xs text-neutral-500 underline underline-offset-4 hover:text-foreground">{marqueePaused ? "Play photos" : "Pause photos"}</button>
        </div>
      </div>
    </section>
  );
}
