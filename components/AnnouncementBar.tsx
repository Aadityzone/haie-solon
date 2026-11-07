import Link from "next/link";

export default function AnnouncementBar() {
  return (
    <aside
      aria-label="Special Welcome Offer"
      className="relative z-50 border-b border-champagne/30 bg-[#0e0e10] text-foreground text-xs"
    >
      <div className="mx-auto flex max-w-[1440px] flex-col items-center justify-between gap-2 px-4 py-2.5 sm:flex-row sm:px-8 lg:px-12">
        {/* Offer Headline & Supporting Text */}
        <div className="flex flex-wrap items-center justify-center gap-2 text-center sm:justify-start sm:text-left">
          <span className="inline-flex items-center rounded-sm bg-champagne/15 px-2 py-0.5 text-[0.68rem] font-bold uppercase tracking-widest text-champagne border border-champagne/30">
            Welcome Offer
          </span>
          <span className="font-[family-name:var(--font-serif)] font-bold tracking-tight text-ivory text-sm sm:text-base">
            50% OFF ON HAIRCUTS!
          </span>
          <span className="hidden text-neutral-400 sm:inline">·</span>
          <span className="text-neutral-300">
            Special welcome offer for first-time customers.
          </span>
        </div>

        {/* Pricing comparison & CTA */}
        <div className="flex flex-wrap items-center justify-center gap-3">
          <div className="flex items-center gap-2 rounded-sm bg-charcoal px-2.5 py-1 border border-border">
            <span className="text-neutral-400">Regular:</span>
            <span className="line-through text-neutral-400 tabular-nums">₹100</span>
            <span className="text-neutral-600">→</span>
            <span className="text-neutral-300">First-Time:</span>
            <span className="font-bold text-champagne tabular-nums text-sm">₹50</span>
          </div>

          <Link
            href="/book"
            className="inline-flex items-center gap-1 font-semibold uppercase tracking-wider text-[0.7rem] text-champagne hover:text-champagne-light transition-colors underline decoration-champagne/50 underline-offset-4"
          >
            Book Now <span aria-hidden="true">↗</span>
          </Link>
        </div>
      </div>

      {/* Terms disclaimer line */}
      <div className="border-t border-border/40 bg-charcoal/60 px-4 py-1 text-center text-[0.66rem] text-neutral-400 sm:px-8">
        Offer applies to haircut only and is available to first-time customers. Ask in salon for details.
      </div>
    </aside>
  );
}

