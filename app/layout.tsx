import type { Metadata, Viewport } from "next";
import "./globals.css";
import { salonConfig } from "@/config/salon";
import MotionProvider from "@/components/MotionProvider";
import MobileActionBar from "@/components/MobileActionBar";

/**
 * `viewportFit: "cover"` lets the page paint into the notch and home-indicator
 * area, which is what makes every `env(safe-area-inset-*)` value in
 * `globals.css` and the fixed bars anything other than `0`. Without it those
 * insets silently evaluate to zero and the handling is dead code — the bars
 * simply sit under the notch instead. Because turning it on is only safe once
 * the bars pay their insets back, the header, the booking sheet's action bar and
 * the mobile action bar all do so explicitly.
 *
 * `interactiveWidget: "resizes-content"` asks the browser (Chromium) to shrink
 * the layout viewport when the on-screen keyboard opens, so the booking sheet's
 * `dvh` height already excludes the keyboard. iOS ignores the hint and overlays
 * the keyboard instead, which is why `BookingDialog` also tracks
 * `visualViewport`.
 *
 * Zoom is deliberately left enabled: `maximumScale` and `userScalable` are not
 * set, so a visitor can still pinch-zoom.
 */
export const viewport: Viewport = {
  themeColor: "#0A0A0B",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
};

export const metadata: Metadata = {
  title: `${salonConfig.name} — ${salonConfig.tagline} in ${salonConfig.location.city}`,
  description: `${salonConfig.description} Send an appointment request online; timing and price are confirmed by the salon.`,
  keywords: [
    "salon",
    "unisex salon",
    "hair salon",
    "beauty salon",
    salonConfig.location.city,
    salonConfig.location.state,
    "haircut",
    "grooming",
    "hair colour",
    "bridal styling",
  ],
  openGraph: {
    title: `${salonConfig.name} — ${salonConfig.tagline}`,
    description: salonConfig.description,
    type: "website",
    locale: "en_IN",
    siteName: salonConfig.name,
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="scroll-smooth" data-scroll-behavior="smooth">
      <head>
        <link rel="icon" href="/favicon.ico" sizes="any" />
      </head>
      <body className="min-h-screen bg-background text-foreground antialiased">
        <a href="#main-content" className="sr-only z-[100] bg-champagne px-4 py-3 font-medium text-charcoal focus:not-sr-only focus:fixed focus:left-4 focus:top-4">
          Skip to main content
        </a>
        <MotionProvider>{children}</MotionProvider>
        <MobileActionBar />
      </body>
    </html>
  );
}
