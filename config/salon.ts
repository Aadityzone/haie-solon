/**
 * Central salon configuration — SALMAN UNISEX HAIR SALOON & ACADEMY
 * ===================================================================
 * All business details in one place. The service catalogue lives in
 * config/service-catalogue.ts and the database — not here.
 */

export const salonConfig = {
  name: "Salman Unisex Hair Saloon & Academy",
  nameShort: "Salman Salon",
  tagline: "Unisex Hair Saloon & Academy",
  description:
    "Professional grooming, modern hairstyles and expert salon services at Salman Unisex Hair Saloon & Academy in Patiala, Punjab. Walk in or book an appointment.",

  contact: {
    phone: "+919917953267",
    phoneDisplay: "+91 99179 53267",
    whatsappUrl:
      "https://wa.me/919917953267?text=Hello%2C%20I%20would%20like%20to%20enquire%20about%20your%20salon%20services%20and%20appointment%20availability.",
    email: "Salmanmalik29452@gmail.com",
  },

  location: {
    city: "Patiala",
    state: "Punjab",
    pincode: "147002",
    country: "India",
    fullAddress:
      "Plot No. 11, Man Dhaba Gali, Opposite Bawa PG, Near Punjabi University, Patiala, Punjab, India – 147002",
    googleMapsUrl:
      "https://www.google.com/maps/place/30%C2%B021%2721.0%22N+76%C2%B027%2722.2%22E/@30.3558333,76.4561667,17z",
    directionsUrl:
      "https://www.google.com/maps/dir/?api=1&destination=30.3558333%2C76.4561667",
    latitude: 30.3558333,
    longitude: 76.4561667,
  },

  hours: {
    confirmed: false,
    schedule: [
      { days: "Monday – Saturday", time: "10:00 AM – 8:00 PM" },
      { days: "Sunday", time: "10:00 AM – 7:00 PM" },
    ],
  },

  social: {
    instagram: "https://www.instagram.com/salman_18999/",
    instagramHandle: "@salman_18999",
    facebook: "",
  },

  /**
   * Google Reviews configuration
   */
  reviews: {
    googleReviewUrl:
      process.env.NEXT_PUBLIC_GOOGLE_REVIEW_URL ||
      "https://g.page/r/CZcCqUhCtvxeECE/review",
    confirmed: true,
  },

  ownerName: "Salman Malik",
} as const;

/**
 * Verified Core Pricing for Salman Unisex Hair Saloon & Academy
 * - Haircut: ₹100 (First-time customers: ₹50)
 * - Beard Grooming: ₹50
 * - Haircut + Beard Combo: ₹150 (simply combined price ₹100 + ₹50, not a discount)
 * - O3+ D-Tan Pack: ₹200
 */
export const verifiedCorePrices = [
  {
    id: "haircut",
    name: "Haircut",
    priceRupees: 100,
    priceDisplay: "₹100",
    firstTimePrice: "₹50",
    duration: "30 min",
    description: "Professional haircut tailored to your personal style and face shape.",
    badge: "50% Off First Visit (₹50)",
    note: "Regular ₹100 · First-time customers ₹50",
  },
  {
    id: "beard",
    name: "Beard Grooming",
    priceRupees: 50,
    priceDisplay: "₹50",
    firstTimePrice: null,
    duration: "20 min",
    description: "Sharp line-up, trimming, precision edging, and beard conditioning.",
    badge: null,
    note: "Standalone beard service",
  },
  {
    id: "combo",
    name: "Haircut + Beard Combo",
    priceRupees: 150,
    priceDisplay: "₹150",
    firstTimePrice: null,
    duration: "45 min",
    description: "Combined haircut and beard grooming session in one appointment.",
    badge: "₹100 + ₹50 Combined",
    note: "Combined standard price (₹100 + ₹50). Not discounted.",
  },
  {
    id: "dtan",
    name: "O3+ D-Tan Pack",
    priceRupees: 200,
    priceDisplay: "₹200",
    firstTimePrice: null,
    duration: "30 min",
    description: "Professional O3+ de-tan treatment pack for bright, refreshed, tan-free skin.",
    badge: "O3+ Professional",
    note: "Specialized de-tan skin treatment",
  },
] as const;

/**
 * Additional services from Google Business Profile
 * Display: "Ask in salon for pricing"
 */
export const additionalSalonServices = [
  "Hair Colouring",
  "Hairstyling",
  "Blowdry",
  "Body Waxing",
  "Children's Cuts",
  "Curly Hair Care",
  "Dreadlocks",
  "Hair Extensions",
  "Hair Highlighting",
  "Hair Straightening",
  "Hair Treatments",
  "Keratin Treatments",
  "Shampoo & Conditioning",
  "Shaving",
] as const;

/** Gallery images */
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
    alt: "Occasion hair styling and finishing",
    category: "styling",
  },
  {
    id: 6,
    src: "/images/gallery/gallery-6.jpg",
    alt: "Premium salon products and tools",
    category: "interior",
  },
] as const;

/** Navigation items */
export const navItems = [
  { label: "Home", href: "#home" },
  { label: "Services", href: "#services" },
  { label: "Gallery", href: "#gallery" },
  { label: "About", href: "#about" },
  { label: "Reviews", href: "#reviews" },
  { label: "Location", href: "#location" },
] as const;
