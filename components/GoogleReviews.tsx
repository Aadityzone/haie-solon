import Image from "next/image";
import { salonConfig } from "@/config/salon";

/**
 * Google Reviews section.
 *
 * Official Google Review URL:
 * https://g.page/r/CZcCqUhCtvxeECE/review
 *
 * Configurable via NEXT_PUBLIC_GOOGLE_REVIEW_URL with an authoritative fallback.
 */
export default function GoogleReviews() {
  const reviewUrl =
    salonConfig.reviews.googleReviewUrl ||
    "https://g.page/r/CZcCqUhCtvxeECE/review";

  return (
    <section id="reviews" className="section-padding bg-charcoal scroll-mt-20">
      <div className="mx-auto max-w-7xl px-5 sm:px-8 lg:px-12">
        <div className="grid gap-12 lg:grid-cols-[1fr_auto] lg:items-center lg:gap-20">
          {/* Content */}
          <div>
            <p className="eyebrow text-champagne">Customer Feedback</p>
            <h2 className="mt-4 font-[family-name:var(--font-serif)] text-4xl leading-tight tracking-tight text-ivory sm:text-5xl">
              Your Experience Matters
            </h2>
            <div className="mt-4 h-px w-14 bg-champagne" />
            <p className="mt-6 max-w-xl text-base leading-7 text-neutral-300">
              Your feedback helps us continuously elevate our service and helps others in Patiala discover our salon and academy. We would love to hear about your experience with us.
            </p>

            <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center">
              <a
                href={reviewUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-primary inline-flex items-center gap-3 shadow-lg hover:shadow-champagne/20"
              >
                {/* Official Google Icon */}
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    fill="#4285F4"
                  />
                  <path
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    fill="#34A853"
                  />
                  <path
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    fill="#FBBC05"
                  />
                  <path
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    fill="#EA4335"
                  />
                </svg>
                Review Us on Google <span aria-hidden="true">↗</span>
              </a>

              <a
                href={reviewUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-secondary text-xs text-neutral-300"
              >
                Open Google Reviews Page
              </a>
            </div>

            <p className="mt-6 max-w-lg text-xs leading-5 text-neutral-400">
              Every guest is encouraged to share their genuine, honest feedback. We do not filter reviews or offer incentives for ratings.
            </p>
          </div>

          {/* Scannable Real QR Code Box */}
          <div className="flex flex-col items-center gap-3 lg:items-end">
            <div className="rounded-sm border border-champagne/40 bg-white p-5 shadow-2xl">
              <div className="relative h-44 w-44 sm:h-48 sm:w-48 bg-white">
                <Image
                  src="/images/google-review-qr.png"
                  alt="Scannable QR code that directly opens the Google Review submission page for Salman Unisex Hair Saloon & Academy"
                  width={192}
                  height={192}
                  className="block h-full w-full object-contain"
                  priority
                />
              </div>
            </div>

            <p className="text-center font-medium text-xs tracking-wide text-champagne sm:text-sm">
              Scan to leave us a Google Review
            </p>

            <a
              href="/images/google-review-qr.png"
              download="salman-salon-google-review-qr.png"
              className="inline-flex items-center gap-1.5 text-xs text-neutral-400 underline decoration-champagne/50 underline-offset-4 hover:text-champagne transition-colors"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
              Download printable QR code
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
