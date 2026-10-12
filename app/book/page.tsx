import { Suspense } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import BookingStart from "@/components/booking/BookingStart";
import { salonConfig } from "@/config/salon";

export const metadata = {
  title: "Book an appointment",
  description:
    "Choose your services, pick a time that suits you, and send an appointment request to the salon. Every request is reviewed by the salon before it is confirmed.",
};

/**
 * The booking page.
 *
 * Steps, prices, durations, and the bookable window are all owned by the wizard,
 * which reads them from the server. Nothing about the salon's availability is
 * decided in this file.
 *
 * It is rendered per request, matching the homepage: availability should never be
 * served from a stale shell, and a statically prerendered route beside a dynamic
 * one only produces inconsistent client-side prefetching.
 */
export const dynamic = "force-dynamic";

export default function BookPage() {
  return (
    <>
      <Navbar />
      <main id="main-content" className="bg-background pb-16 pt-28 sm:pt-32">
        <div className="mx-auto max-w-3xl px-5 sm:px-8">
          <p className="eyebrow">Online reservation</p>
          <h1 className="mt-4 text-3xl sm:text-4xl lg:text-5xl">Book an appointment</h1>
          <p className="mt-4 max-w-xl text-sm leading-6 text-neutral-500 sm:text-base">
            Choose your services and a time that suits you. The salon reviews every request and confirms it — your
            appointment is not held as confirmed until they do.
          </p>

          <nav aria-label="Booking help" className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-1 text-xs">
            <Link
              href="/book/status"
              className="inline-flex min-h-11 items-center text-champagne underline-offset-4 hover:underline"
            >
              Check an existing request
            </Link>
            <a
              href={salonConfig.contact.whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center text-champagne underline-offset-4 hover:underline"
            >
              Message the salon instead
            </a>
            <a
              href={`tel:${salonConfig.contact.phone}`}
              className="inline-flex min-h-11 items-center text-champagne underline-offset-4 hover:underline"
            >
              Call {salonConfig.contact.phoneDisplay}
            </a>
          </nav>

          <div className="mt-10 border-t border-border pt-8">
            {/* `useSearchParams` needs a Suspense boundary so the route can still
                be statically prerendered. */}
            <Suspense fallback={<BookingWizardSkeleton />}>
              <BookingStart />
            </Suspense>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}

function BookingWizardSkeleton() {
  return (
    <div className="flex flex-col items-center gap-4 py-20" role="status" aria-live="polite">
      <span aria-hidden="true" className="h-7 w-7 animate-spin rounded-full border-2 border-champagne border-t-transparent" />
      <p className="text-sm text-neutral-500">Loading the salon services and availability…</p>
    </div>
  );
}
