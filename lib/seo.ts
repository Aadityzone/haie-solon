import { salonConfig } from "@/config/salon";

/**
 * Canonical website origin configured via environment variable.
 * Fallback to the currently assigned production deployment origin.
 */
export const SITE_ORIGIN = (
  process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://reehan-salon-demo.vercel.app"
).replace(/\/+$/, "");

/**
 * Returns an absolute URL based on the canonical site origin.
 */
export function absoluteUrl(path: string = ""): string {
  if (!path || path === "/") return SITE_ORIGIN;
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return `${SITE_ORIGIN}${cleanPath}`;
}

/**
 * Valid Schema.org JSON-LD structured data for Salman Unisex Hair Saloon & Academy.
 * Only verified facts are included. Ratings, review counts, awards, and unconfirmed hours are excluded.
 */
export function getLocalBusinessSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "HairSalon",
    "@id": `${SITE_ORIGIN}/#salon`,
    name: salonConfig.name,
    alternateName: "Salman Salon Patiala",
    description:
      "Professional unisex salon and hair academy near Punjabi University, Patiala, offering haircuts, beard grooming, hairstyling, colouring and hair care treatments.",
    url: SITE_ORIGIN,
    telephone: salonConfig.contact.phoneDisplay,
    email: salonConfig.contact.email,
    address: {
      "@type": "PostalAddress",
      streetAddress: "Plot No. 11, Man Dhaba Gali, Opposite Bawa PG, Near Punjabi University",
      addressLocality: salonConfig.location.city,
      addressRegion: salonConfig.location.state,
      postalCode: salonConfig.location.pincode,
      addressCountry: "IN",
    },
    geo: {
      "@type": "GeoCoordinates",
      latitude: salonConfig.location.latitude,
      longitude: salonConfig.location.longitude,
    },
    hasMap: salonConfig.location.googleMapsUrl,
    sameAs: [salonConfig.social.instagram].filter(Boolean),
    priceRange: "₹50 - ₹200",
    currenciesAccepted: "INR",
    paymentAccepted: "Cash, UPI",
    image: absoluteUrl("/images/hero.jpg"),
    areaServed: [
      {
        "@type": "AdministrativeArea",
        name: "Patiala",
      },
      {
        "@type": "Place",
        name: "Punjabi University, Patiala",
      },
    ],
  };
}

