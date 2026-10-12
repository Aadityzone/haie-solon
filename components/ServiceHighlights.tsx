"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { serviceHighlights } from "@/config/salon";

gsap.registerPlugin(ScrollTrigger);

/**
 * Editorial direction cards. Deliberately separate from the owner-configured
 * menu: these four directions are presentation, never a price list.
 *
 * Motion is scoped and reversible, matches the gallery reveal, and is skipped
 * entirely when the visitor asks for reduced motion.
 */
export default function ServiceHighlights() {
  const rootRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const context = gsap.context(() => {
      gsap.fromTo(
        headerRef.current,
        { opacity: 0, y: 24 },
        {
          opacity: 1,
          y: 0,
          duration: 0.8,
          ease: "power3.out",
          scrollTrigger: { trigger: headerRef.current, start: "top 88%", once: true },
        },
      );

      const cards = gridRef.current?.children;
      if (cards?.length) {
        gsap.fromTo(
          cards,
          { opacity: 0, y: 24 },
          {
            opacity: 1,
            y: 0,
            duration: 0.7,
            stagger: 0.08,
            ease: "power3.out",
            scrollTrigger: { trigger: gridRef.current, start: "top 85%", once: true },
          },
        );
      }
    }, rootRef);

    return () => context.revert();
  }, []);

  return (
    <div ref={rootRef}>
      <div ref={headerRef} className="mb-12 grid gap-6 border-b border-border pb-7 md:grid-cols-[1fr_20rem] md:items-end md:gap-12">
        <div>
          <p className="eyebrow">The service edit</p>
          <h2 className="mt-4 max-w-3xl text-4xl leading-[1.05] text-balance sm:text-5xl lg:text-6xl">Good hair begins with a conversation.</h2>
        </div>
        <p className="text-sm leading-6 text-neutral-500">A first look at the kinds of services the studio may offer. Menu, pricing, durations, and availability are provisional until confirmed by the owner.</p>
      </div>

      <div ref={gridRef} className="grid gap-x-5 gap-y-9 sm:grid-cols-2 lg:grid-cols-4">
        {serviceHighlights.map((item) => (
          <article key={item.number} className="group min-w-0">
            <Link href="/book" className="block focus-visible:outline-offset-4" aria-label={`Send an appointment request about ${item.title}`}>
              <div className="relative aspect-[4/5] overflow-hidden bg-elevated">
                <Image
                  src={item.image}
                  alt={`Illustrative salon photography for ${item.title.toLowerCase()}`}
                  fill
                  sizes="(max-width: 640px) 90vw, (max-width: 1024px) 45vw, 23vw"
                  className="object-cover transition-transform duration-700 group-hover:scale-[1.035]"
                />
                <span className="absolute bottom-3 left-3 border border-white/25 bg-background/75 px-2 py-1 text-[0.58rem] uppercase tracking-[0.12em] text-foreground">Illustrative image</span>
              </div>
              <div className="mt-4 flex items-baseline justify-between gap-3 border-b border-border pb-3">
                <h3 className="text-xl sm:text-2xl">{item.title}</h3>
                <span className="text-lg text-champagne transition-transform group-hover:translate-x-1" aria-hidden="true">↗</span>
              </div>
              <p className="mt-3 text-sm leading-6 text-neutral-500">{item.description}</p>
              <p className="mt-3 text-[0.62rem] uppercase tracking-[0.1em] text-neutral-500">Ask about availability and pricing</p>
            </Link>
          </article>
        ))}
      </div>
    </div>
  );
}
