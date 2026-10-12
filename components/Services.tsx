import { Suspense } from "react";
import Link from "next/link";
import ServiceHighlights from "@/components/ServiceHighlights";
import ServiceMenu from "@/components/ServiceMenu";

export default function Services() {
  return (
    <section id="services" className="section-padding bg-background">
      <div className="mx-auto max-w-[1440px] px-5 sm:px-8 lg:px-12">
        <ServiceHighlights />

        {/* The primary action of this section, above the menu so it is reachable
            without reading the whole price list first. */}
        <div className="mt-10 flex flex-col gap-4 border-t border-border pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="max-w-3xl text-xs leading-5 text-neutral-500">
            The four directions above are an editorial overview, not a price list. Photography is illustrative and is
            not presented as this salon&apos;s own portfolio.
          </p>
          <Link href="/book" className="btn-primary shrink-0">
            Book an appointment <span aria-hidden="true">↗</span>
          </Link>
        </div>

        <div className="mt-12">
          {/* The menu is read from the salon's own records, so it streams in
              rather than holding up the rest of the page. */}
          <Suspense fallback={<p className="border-t border-border pt-8 text-sm text-neutral-500">Loading the service menu…</p>}>
            <ServiceMenu />
          </Suspense>
        </div>
      </div>
    </section>
  );
}
