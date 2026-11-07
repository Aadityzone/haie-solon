"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { verifiedCorePrices, additionalSalonServices } from "@/config/salon";

gsap.registerPlugin(ScrollTrigger);

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
    <div ref={rootRef} className="space-y-12">
      {/* Header */}
      <div ref={headerRef} className="border-b border-border pb-8">
        <div className="grid gap-6 md:grid-cols-[1fr_22rem] md:items-end md:gap-12">
          <div>
            <p className="eyebrow">Service Pricing</p>
            <h2 className="mt-4 max-w-3xl font-[family-name:var(--font-serif)] text-4xl leading-[1.05] tracking-tight text-foreground sm:text-5xl lg:text-6xl">
              Transparent Salon Pricing
            </h2>
          </div>
          <p className="text-sm leading-6 text-neutral-400">
            Clear, honest pricing with no hidden charges. Walk in or book your time online with our master stylists in Patiala.
          </p>
        </div>
      </div>

      {/* 4 Core Verified Pricing Cards */}
      <div>
        <div className="mb-6 flex items-center justify-between">
          <h3 className="font-[family-name:var(--font-serif)] text-2xl text-foreground">
            Featured Core Services
          </h3>
          <span className="text-xs text-neutral-400">All prices in Indian Rupees (₹)</span>
        </div>

        <div ref={gridRef} className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {verifiedCorePrices.map((item) => (
            <article
              key={item.id}
              className="flex flex-col justify-between rounded-sm border border-border bg-surface p-6 transition-all duration-300 hover:border-champagne/60 hover:shadow-lg"
            >
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs text-champagne">{item.duration}</span>
                  {item.badge && (
                    <span className="rounded-xs bg-champagne/10 px-2 py-0.5 text-[0.65rem] font-semibold text-champagne border border-champagne/25">
                      {item.badge}
                    </span>
                  )}
                </div>

                <h4 className="mt-3 font-[family-name:var(--font-serif)] text-xl font-bold tracking-wide text-ivory sm:text-2xl">
                  {item.name}
                </h4>

                <p className="mt-2 text-xs leading-5 text-neutral-300">
                  {item.description}
                </p>
              </div>

              <div className="mt-6 border-t border-border/80 pt-4">
                <div className="flex items-baseline justify-between">
                  <div>
                    <span className="font-[family-name:var(--font-serif)] text-3xl font-bold text-champagne tabular-nums sm:text-4xl">
                      {item.priceDisplay}
                    </span>
                  </div>
                </div>

                <p className="mt-1 text-[0.7rem] text-neutral-400">
                  {item.note}
                </p>

                <Link
                  href={`/book?service=${item.id}`}
                  className="mt-4 flex min-h-[40px] w-full items-center justify-center border border-border bg-charcoal px-3 py-2 text-xs font-semibold uppercase tracking-wider text-neutral-200 transition-colors hover:border-champagne hover:bg-champagne hover:text-charcoal"
                >
                  Book Service <span aria-hidden="true" className="ml-1">↗</span>
                </Link>
              </div>
            </article>
          ))}
        </div>
      </div>

      {/* Additional Salon Services from Google Business Profile */}
      <div className="rounded-sm border border-border bg-surface p-6 sm:p-8">
        <div className="border-b border-border pb-4">
          <p className="eyebrow text-champagne">Full Service Menu</p>
          <h3 className="mt-2 font-[family-name:var(--font-serif)] text-2xl font-bold text-ivory">
            Additional Salon &amp; Academy Services
          </h3>
          <p className="mt-1 text-xs text-neutral-300">
            For specialized services without confirmed fixed pricing, custom consultation is provided at our Patiala studio.
          </p>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {additionalSalonServices.map((serviceName) => (
            <div
              key={serviceName}
              className="flex items-center justify-between rounded-sm border border-border/80 bg-charcoal/70 p-3.5 transition-colors hover:border-champagne/60"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="h-1.5 w-1.5 rounded-full bg-champagne shrink-0" aria-hidden="true" />
                <span className="text-sm font-semibold tracking-wide text-ivory sm:text-base">
                  {serviceName}
                </span>
              </div>
              <span className="ml-3 shrink-0 rounded-xs bg-charcoal px-2.5 py-1 text-[0.72rem] font-medium text-champagne-light border border-champagne/30">
                Ask in salon for pricing
              </span>
            </div>
          ))}
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-border pt-4 text-xs text-neutral-400">
          <span>Walk-ins welcome during salon hours · Consultation free with any booking</span>
          <a
            href="https://wa.me/919917953267"
            target="_blank"
            rel="noopener noreferrer"
            className="text-champagne underline decoration-champagne/40 underline-offset-4 hover:decoration-champagne"
          >
            Enquire about pricing on WhatsApp →
          </a>
        </div>
      </div>
    </div>
  );
}
