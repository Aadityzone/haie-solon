import type { Metadata, Viewport } from "next";
import "./globals.css";
import MotionProvider from "@/components/MotionProvider";
import MobileActionBar from "@/components/MobileActionBar";
import { SITE_ORIGIN, getLocalBusinessSchema } from "@/lib/seo";

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

const defaultTitle = "Salman Unisex Hair Saloon & Academy | Unisex Salon in Patiala";
const defaultDescription =
  "Looking for a unisex salon near Punjabi University, Patiala? Visit Salman Unisex Hair Saloon & Academy for haircuts, beard grooming, hairstyling and professional hair care.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_ORIGIN),
  title: {
    default: defaultTitle,
    template: "%s | Salman Unisex Hair Saloon & Academy",
  },
  description: defaultDescription,
  applicationName: "Salman Unisex Hair Saloon & Academy",
  authors: [{ name: "Salman Malik" }],
  generator: "Next.js",
  keywords: [
    "Salman Unisex Hair Saloon Patiala",
    "Unisex Salon in Patiala",
    "Unisex Salon near Punjabi University",
    "Haircut near Punjabi University Patiala",
    "Beard Grooming in Patiala",
    "Hair Styling in Patiala",
    "Hair Colouring in Patiala",
    "Hair Academy Patiala",
    "Salman Salon Patiala",
    "Salon Patiala Punjab",
  ],
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: defaultTitle,
    description: defaultDescription,
    url: SITE_ORIGIN,
    siteName: "Salman Unisex Hair Saloon & Academy",
    locale: "en_IN",
    type: "website",
    images: [
      {
        url: "/images/hero.jpg",
        width: 1200,
        height: 630,
        alt: "Salman Unisex Hair Saloon & Academy in Patiala, Punjab",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: defaultTitle,
    description: defaultDescription,
    images: ["/images/hero.jpg"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  verification: {
    google:
      process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION ||
      process.env.GOOGLE_SITE_VERIFICATION ||
      "wIHIAESRsCZOJPyVTk2VdFiEy3nZUsIwoICK8j1jBQw",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const jsonLd = getLocalBusinessSchema();

  return (
    <html lang="en-IN" className="scroll-smooth" data-scroll-behavior="smooth">
      <head>
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(jsonLd),
          }}
        />
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
