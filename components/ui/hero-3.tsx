"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import gsap from "gsap";
import { salonConfig } from "@/config/salon";

const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

/** Cinematic hero for Salman Unisex Hair Saloon & Academy. All imagery is illustrative until owner approved. */
export default function AnimatedMarqueeHero() {
  const rootRef = useRef<HTMLElement>(null);
  const [marqueePaused, setMarqueePaused] = useState(false);

  useIsomorphicLayoutEffect(() => {
    const root = rootRef.current;
    if (!root || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const context = gsap.context(() => {
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
    <section ref={rootRef} id="home" aria-labelledby="hero-title" className="relative overflow-hidden bg-background pt-36 sm:pt-40 lg:pt-44">
      <div className="mx-auto grid max-w-[1440px] items-center gap-10 px-5 pb-12 sm:px-8 lg:grid-cols-[0.9fr_1.1fr] lg:gap-14 lg:px-12 lg:pb-16">
        <div className="relative z-10 max-w-2xl py-4 lg:py-12">
          <p data-hero-copy className="eyebrow">Patiala&apos;s Premier Unisex Salon &amp; Academy</p>
          <h1
            id="hero-title"
            data-hero-copy
            className="mt-6 max-w-[13ch] font-[family-name:var(--font-serif)] text-[clamp(2.2rem,9vw,6.5rem)] leading-[1.02] tracking-[-0.035em] text-foreground sm:leading-[0.98]"
          >
            Your Style.{" "}
            <span className="text-champagne">Your Identity.</span>
          </h1>
          <p data-hero-copy className="mt-6 max-w-lg text-base leading-7 text-neutral-400 sm:text-lg sm:leading-8">
            Professional grooming, modern hairstyles and expert salon services — designed around your personality at Salman Unisex Hair Saloon &amp; Academy, Patiala.
          </p>

          {/* Prominent Action & Location Buttons */}
          <div data-hero-copy className="mt-8 flex flex-wrap items-center gap-3">
            <Link href="/book" className="btn-primary">
              Book an Appointment <span aria-hidden="true">↗</span>
            </Link>

            <a
              href="#location"
              className="inline-flex min-h-[48px] items-center justify-center gap-2 border border-champagne bg-charcoal-muted px-5 py-3 text-xs font-semibold tracking-wider text-champagne uppercase transition-all duration-200 hover:border-champagne-light hover:bg-champagne hover:text-charcoal"
            >
              <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
              </svg>
              Find Our Salon
            </a>

            <a href="#services" className="btn-secondary text-xs">
              Explore Services
            </a>
          </div>

          <div data-hero-copy className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-neutral-400">
            <span className="inline-flex items-center gap-1.5 text-champagne">
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
              </svg>
              Near Punjabi University, Patiala
            </span>
            <span className="text-neutral-600">·</span>
            <a href={`tel:${salonConfig.contact.phone}`} className="hover:text-champagne transition-colors underline decoration-champagne/40 underline-offset-4">
              {salonConfig.contact.phoneDisplay}
            </a>
            <span className="text-neutral-600">·</span>
            <span className="text-neutral-500">Walk-ins &amp; appointments welcome</span>
          </div>
        </div>

        <div data-hero-visual className="relative min-w-0 lg:pl-2">
          <div className="absolute -right-3 -top-3 h-[42%] w-[42%] border border-champagne/50 sm:-right-4 sm:-top-4" aria-hidden="true" />
          <div className="relative aspect-[4/3] overflow-hidden bg-elevated sm:aspect-[1.16/1]">
            <Image
              src="/images/hero.jpg"
              alt="Illustrative cinematic salon interior; not a verified photograph of Salman Salon"
              fill
              preload
              sizes="(max-width: 1024px) 100vw, 56vw"
              className="object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-background/45 via-transparent to-transparent" aria-hidden="true" />
            <span className="absolute bottom-4 left-4 text-[0.7rem] uppercase tracking-[0.14em] text-foreground/80">
              Illustrative salon imagery
            </span>
          </div>
          <div className="mt-4 flex items-center justify-between border-t border-border pt-3 text-[0.7rem] uppercase tracking-[0.14em] text-neutral-500">
            <span>Hair · Grooming · Academy</span>
            <span>Patiala, Punjab</span>
          </div>
        </div>
      </div>

      <div className="border-y border-border/80 py-4" aria-label="Illustrative salon and hair photography">
        <div className="marquee-viewport">
          <div
            className="marquee-track"
            aria-hidden="true"
            style={{ animationPlayState: marqueePaused ? "paused" : undefined }}
          >
            {[0, 1].map((copy) => (
              <div key={copy} className="marquee-group">
                {[
                  ["/images/gallery/gallery-2.jpg", "high"],
                  ["/images/gallery/gallery-4.jpg", "low"],
                  ["/images/about.jpg", "high"],
                  ["/images/gallery/gallery-5.jpg", "low"],
                ].map(([src, position], index) => (
                  <div
                    key={`${copy}-${index}`}
                    className={`marquee-photo ${position === "high" ? "marquee-photo-high" : "marquee-photo-low"}`}
                  >
                    <Image src={src} alt="" fill sizes="(max-width: 640px) 62vw, 28vw" className="object-cover" loading="lazy" />
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
        <div className="mx-auto mt-3 flex max-w-7xl items-center justify-between gap-4 px-5 sm:px-8 lg:px-12">
          <p className="text-[0.6rem] uppercase tracking-[0.12em] text-neutral-500">
            Illustrative imagery · not represented as salon client work
          </p>
          <button
            type="button"
            aria-pressed={marqueePaused}
            onClick={() => setMarqueePaused((value) => !value)}
            className="min-h-11 shrink-0 text-xs text-neutral-500 underline underline-offset-4 hover:text-foreground"
          >
            {marqueePaused ? "Play photos" : "Pause photos"}
          </button>
        </div>
      </div>
    </section>
  );
}
