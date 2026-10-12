import type { Metadata, Viewport } from "next";
import "./globals.css";
import { salonConfig } from "@/config/salon";

export const viewport: Viewport = {
  themeColor: "#0A0A0B",
  width: "device-width",
  initialScale: 1,
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
        {children}
      </body>
    </html>
  );
}
