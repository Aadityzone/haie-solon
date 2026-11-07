import type { Metadata, Viewport } from "next";
import "./globals.css";
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
  title: {
    default: "Salman Unisex Hair Saloon & Academy — Patiala, Punjab",
    template: "%s | Salman Unisex Hair Saloon & Academy",
  },
  description:
    "Professional grooming, modern hairstyles and expert salon services at Salman Unisex Hair Saloon & Academy. Located near Punjabi University, Patiala, Punjab. Book an appointment online.",
  keywords: [
    "salon",
    "unisex salon",
    "hair salon",
    "beauty salon",
    "Patiala",
    "Punjab",
    "haircut",
    "grooming",
    "beard trim",
    "hair colour",
    "hair academy",
    "Salman salon",
    "salon near Punjabi University",
  ],
  openGraph: {
    title: "Salman Unisex Hair Saloon & Academy — Patiala",
    description:
      "Professional grooming, modern hairstyles and expert salon services in Patiala, Punjab.",
    type: "website",
    locale: "en_IN",
    siteName: "Salman Unisex Hair Saloon & Academy",
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
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "HairSalon",
              name: "Salman Unisex Hair Saloon & Academy",
              description:
                "Professional grooming, modern hairstyles and expert salon services in Patiala, Punjab.",
              telephone: "+919917953267",
              email: "Salmanmalik29452@gmail.com",
              address: {
                "@type": "PostalAddress",
                streetAddress:
                  "Plot No. 11, Man Dhaba Gali, Opposite Bawa PG, Near Punjabi University",
                addressLocality: "Patiala",
                addressRegion: "Punjab",
                postalCode: "147002",
                addressCountry: "IN",
              },
              geo: {
                "@type": "GeoCoordinates",
                latitude: 30.3558333,
                longitude: 76.4561667,
              },
              url: "https://your-domain.com",
              sameAs: ["https://www.instagram.com/salman_18999/"],
              priceRange: "₹₹",
              currenciesAccepted: "INR",
              paymentAccepted: "Cash",
              image: "https://your-domain.com/images/hero.jpg",
            }),
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
