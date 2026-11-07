/**
 * Authoritative service catalogue for Salman Unisex Hair Saloon & Academy
 * =========================================================================
 *
 * This is the single source of truth for the salon service catalogue.
 *
 * Verified Core Pricing:
 * - Haircut: ₹100
 * - Beard Grooming: ₹50
 * - Haircut + Beard Combo: ₹150 (₹100 + ₹50 combined price, not discounted)
 * - O3+ D-Tan Pack: ₹200
 *
 * Additional services from Google Business Profile:
 * - Hair colouring, Hairstyling, Blowdry, Body waxing, Children's cuts,
 *   Curly hair, Dreadlocks, Hair extensions, Hair highlighting, Hair straightening,
 *   Hair treatments, Keratin treatments, Shampoo & conditioning, Shaving.
 * Unconfirmed prices are marked with null ("Ask in salon for pricing").
 */

export interface ProposedService {
  /** Stable identifier used as the seeded database row id. */
  id: string;
  name: string;
  description: string;
  categoryId: string;
  categoryName: string;
  /** Verified price in whole rupees, or null for "Ask in salon for pricing". */
  proposedPriceRupees: number | null;
  durationMinutes: number;
  /** Position within the menu. */
  sortOrder: number;
}

export const proposedCatalogue: ProposedService[] = [
  // --- Core Services with Verified Pricing ---
  {
    id: "svc-haircut",
    name: "Haircut",
    description: "Professional haircut tailored to your personal style and facial features.",
    categoryId: "core-cuts",
    categoryName: "Haircut & Grooming",
    proposedPriceRupees: 100,
    durationMinutes: 30,
    sortOrder: 1,
  },
  {
    id: "svc-beard-grooming",
    name: "Beard Grooming",
    description: "Precision beard shaping, edging, trimming and clean grooming.",
    categoryId: "core-cuts",
    categoryName: "Haircut & Grooming",
    proposedPriceRupees: 50,
    durationMinutes: 20,
    sortOrder: 2,
  },
  {
    id: "svc-haircut-beard-combo",
    name: "Haircut + Beard Combo",
    description: "Combined haircut and beard grooming session (₹100 haircut + ₹50 beard grooming).",
    categoryId: "combos",
    categoryName: "Combo Packages",
    proposedPriceRupees: 150,
    durationMinutes: 45,
    sortOrder: 3,
  },
  {
    id: "svc-o3-dtan-pack",
    name: "O3+ D-Tan Pack",
    description: "Professional O3+ de-tan treatment pack for radiant, clean and refreshed skin.",
    categoryId: "skin-care",
    categoryName: "Skin & Facial Care",
    proposedPriceRupees: 200,
    durationMinutes: 30,
    sortOrder: 4,
  },

  // --- Additional Services from Google Business Profile ---
  {
    id: "svc-hair-colouring",
    name: "Hair Colouring & Highlighting",
    description: "Global hair colouring, streaks, highlights and custom tone balancing.",
    categoryId: "colour-styling",
    categoryName: "Hair Colour & Highlights",
    proposedPriceRupees: null,
    durationMinutes: 60,
    sortOrder: 5,
  },
  {
    id: "svc-hairstyling-blowdry",
    name: "Hairstyling & Blowdry",
    description: "Modern hairstyling, volume blowdry, and event finishing.",
    categoryId: "styling",
    categoryName: "Hairstyling & Finishing",
    proposedPriceRupees: null,
    durationMinutes: 30,
    sortOrder: 6,
  },
  {
    id: "svc-keratin-treatment",
    name: "Keratin Treatment",
    description: "Intense smoothing and frizz-free keratin protein treatment.",
    categoryId: "treatments",
    categoryName: "Hair Treatments & Keratin",
    proposedPriceRupees: null,
    durationMinutes: 90,
    sortOrder: 7,
  },
  {
    id: "svc-hair-treatments",
    name: "Hair Treatments & Spa",
    description: "Deep conditioning, scalp care, and revitalizing hair spa therapy.",
    categoryId: "treatments",
    categoryName: "Hair Treatments & Keratin",
    proposedPriceRupees: null,
    durationMinutes: 45,
    sortOrder: 8,
  },
  {
    id: "svc-hair-straightening",
    name: "Hair Straightening",
    description: "Long-lasting hair straightening, rebonding, and smoothening service.",
    categoryId: "treatments",
    categoryName: "Hair Treatments & Keratin",
    proposedPriceRupees: null,
    durationMinutes: 90,
    sortOrder: 9,
  },
  {
    id: "svc-childrens-cuts",
    name: "Children's Cuts",
    description: "Patient, stylish haircuts for kids and students.",
    categoryId: "core-cuts",
    categoryName: "Haircut & Grooming",
    proposedPriceRupees: null,
    durationMinutes: 25,
    sortOrder: 10,
  },
  {
    id: "svc-curly-hair",
    name: "Curly Hair Care",
    description: "Specialized cutting, hydration and styling for natural curls and texture.",
    categoryId: "specialized",
    categoryName: "Specialized Hair Services",
    proposedPriceRupees: null,
    durationMinutes: 45,
    sortOrder: 11,
  },
  {
    id: "svc-dreadlocks",
    name: "Dreadlocks",
    description: "Dreadlocks creation, maintenance, retwisting and styling.",
    categoryId: "specialized",
    categoryName: "Specialized Hair Services",
    proposedPriceRupees: null,
    durationMinutes: 60,
    sortOrder: 12,
  },
  {
    id: "svc-hair-extensions",
    name: "Hair Extensions",
    description: "Natural hair extension consultation, installation, and blending.",
    categoryId: "specialized",
    categoryName: "Specialized Hair Services",
    proposedPriceRupees: null,
    durationMinutes: 60,
    sortOrder: 13,
  },
  {
    id: "svc-body-waxing",
    name: "Body Waxing",
    description: "Smooth and hygienic body waxing services.",
    categoryId: "grooming-care",
    categoryName: "Grooming & Shaving",
    proposedPriceRupees: null,
    durationMinutes: 30,
    sortOrder: 14,
  },
  {
    id: "svc-shampoo-conditioning",
    name: "Shampoo & Conditioning",
    description: "Deep scalp wash, head massage, and nourishing conditioning.",
    categoryId: "treatments",
    categoryName: "Hair Treatments & Keratin",
    proposedPriceRupees: null,
    durationMinutes: 20,
    sortOrder: 15,
  },
  {
    id: "svc-shaving",
    name: "Shaving",
    description: "Traditional clean shave with hot towel prep and aftershave balm.",
    categoryId: "grooming-care",
    categoryName: "Grooming & Shaving",
    proposedPriceRupees: null,
    durationMinutes: 20,
    sortOrder: 16,
  },
];
