/**
 * Central salon configuration
 * ============================
 * Business details in one place. Update this file when the client confirms
 * official information. Values marked [PLACEHOLDER] must be replaced before
 * launch.
 *
 * The service catalogue deliberately does NOT live here: services are owned
 * rows in the database, seeded from `config/service-catalogue.ts` and managed
 * from the owner dashboard. Keeping a second hardcoded copy of the menu in this
 * file is what caused prices to disagree across pages.
 */

export const salonConfig = {
  /** [PLACEHOLDER] — Replace with the official salon name once confirmed */
  name: "Your Salon Name",
  tagline: "Hair Studio",
  description:
    "A welcoming hair studio for considered styling and personal care. Salon story and location details are awaiting confirmation.",

  contact: {
    phone: "+916280866359",
    /** Formatted display version */
    phoneDisplay: "+91 62808 66359",
    /** WhatsApp link with pre-filled message */
    whatsappUrl:
      "https://wa.me/916280866359?text=Hello%2C%20I%20would%20like%20to%20enquire%20about%20your%20salon%20services%20and%20appointment%20availability.",
    /** [PLACEHOLDER] — Add real email when available */
    email: "",
  },

  location: {
    city: "Patiala",
    state: "Punjab",
    pincode: "147002",
    country: "India",
    /** [PLACEHOLDER] — Replace with full verified street address */
    fullAddress: "Location details to be confirmed",
    /** [PLACEHOLDER] — Replace with verified Google Maps link */
    googleMapsUrl:
      "https://www.google.com/maps/search/salon+patiala+punjab+147002",
  },

  hours: {
    /** [PLACEHOLDER] — Replace with confirmed opening hours */
    confirmed: false,
    schedule: [
      { days: "Monday – Saturday", time: "To be confirmed" },
      { days: "Sunday", time: "To be confirmed" },
    ],
  },

  social: {
    /** [PLACEHOLDER] — Add real social handles when provided */
    instagram: "",
    facebook: "",
  },

  /** Owner name — for internal reference, not necessarily displayed */
  ownerName: "Reehan Qureshi",
} as const;

/**
 * Gallery images
 * [PLACEHOLDER] — Replace with actual salon photographs.
 * Current files are illustrative and are labelled as such in the UI.
 */
export const galleryImages = [
  {
    id: 1,
    src: "/images/gallery/gallery-1.jpg",
    alt: "Salon interior with modern styling stations",
    category: "interior",
  },
  {
    id: 2,
    src: "/images/gallery/gallery-2.jpg",
    alt: "Professional hair styling in progress",
    category: "styling",
  },
  {
    id: 3,
    src: "/images/gallery/gallery-3.jpg",
    alt: "Men's grooming and beard styling",
    category: "grooming",
  },
  {
    id: 4,
    src: "/images/gallery/gallery-4.jpg",
    alt: "Hair colour transformation",
    category: "colour",
  },
  {
    id: 5,
    src: "/images/gallery/gallery-5.jpg",
    alt: "Elegant bridal hair styling",
    category: "styling",
  },
  {
    id: 6,
    src: "/images/gallery/gallery-6.jpg",
    alt: "Premium salon products and tools",
    category: "interior",
  },
] as const;

/** Provisional homepage categories: confirm the real menu before publication. */
export const serviceHighlights = [
  {
    number: "01",
    title: "Cuts & styling",
    description: "A considered shape, a fresh finish, or a style that feels unmistakably your own.",
    image: "/images/gallery/gallery-2.jpg",
  },
  {
    number: "02",
    title: "Colour & highlights",
    description: "From subtle dimension to a considered change in tone, tailored through consultation.",
    image: "/images/gallery/gallery-4.jpg",
  },
  {
    number: "03",
    title: "Care & treatments",
    description: "Thoughtful care for your hair and scalp, with the right approach confirmed in person.",
    image: "/images/gallery/gallery-6.jpg",
  },
  {
    number: "04",
    title: "Finishing touches",
    description: "A smooth blow-dry or a special-occasion finish, shaped around your plans.",
    image: "/images/gallery/gallery-5.jpg",
  },
] as const;

/** Navigation items */
export const navItems = [
  { label: "Home", href: "#home" },
  { label: "Services", href: "#services" },
  { label: "Our Work", href: "#gallery" },
  { label: "About", href: "#about" },
  { label: "Contact", href: "#contact" },
] as const;
