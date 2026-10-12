/**
 * Authoritative service catalogue.
 * ================================
 *
 * This is the single source of truth for the *proposed* starting catalogue. It
 * is used in exactly two places:
 *
 *  1. `lib/db.ts` seeds these services into the database on first run.
 *  2. The owner dashboard offers them as "suggested starting points".
 *
 * Seeding publishes the proposed price as the *starting* price and enables the
 * row, so a first-run install has a working booking flow instead of an empty
 * menu. The values stay editable, and every customer surface labels them as
 * provisional: `services.price_verified` records whether the owner has saved
 * that row, and the public menu says so until they do.
 *
 * Prices and durations are a proposal from the project brief, not confirmed
 * salon rates. The public site reads the database, never this file.
 */

export interface ProposedService {
  /** Stable identifier used as the seeded database row id. */
  id: string;
  name: string;
  description: string;
  categoryId: string;
  categoryName: string;
  /** Proposed price in whole rupees. Review before publishing. */
  proposedPriceRupees: number;
  durationMinutes: number;
  /** Position within the menu. */
  sortOrder: number;
}

export const proposedCatalogue: ProposedService[] = [
  {
    id: "svc-classic-haircut",
    name: "Classic Haircut",
    description: "A classic haircut, finished to your preference.",
    categoryId: "cuts-styling",
    categoryName: "Cuts & Styling",
    proposedPriceRupees: 300,
    durationMinutes: 30,
    sortOrder: 1,
  },
  {
    id: "svc-haircut-styling",
    name: "Haircut & Styling",
    description: "A haircut followed by a considered styling finish.",
    categoryId: "cuts-styling",
    categoryName: "Cuts & Styling",
    proposedPriceRupees: 500,
    durationMinutes: 45,
    sortOrder: 2,
  },
  {
    id: "svc-shampoo-blow-dry",
    name: "Shampoo & Blow-Dry",
    description: "A shampoo and blow-dry finish.",
    categoryId: "styling",
    categoryName: "Styling",
    proposedPriceRupees: 350,
    durationMinutes: 30,
    sortOrder: 3,
  },
  {
    id: "svc-hair-spa",
    name: "Hair Spa",
    description: "A hair spa service; details to be confirmed by the salon.",
    categoryId: "care-treatments",
    categoryName: "Care & Treatments",
    proposedPriceRupees: 800,
    durationMinutes: 60,
    sortOrder: 4,
  },
  {
    id: "svc-deep-conditioning",
    name: "Deep Conditioning",
    description: "A deep conditioning service; products and process to be confirmed.",
    categoryId: "care-treatments",
    categoryName: "Care & Treatments",
    proposedPriceRupees: 600,
    durationMinutes: 45,
    sortOrder: 5,
  },
  {
    id: "svc-global-colour",
    name: "Global Hair Colour",
    description: "A global hair colour service; a consultation may be needed.",
    categoryId: "colour",
    categoryName: "Colour",
    proposedPriceRupees: 1500,
    durationMinutes: 120,
    sortOrder: 6,
  },
  {
    id: "svc-highlights",
    name: "Highlights",
    description: "Highlights; the final approach is discussed with the salon.",
    categoryId: "colour",
    categoryName: "Colour",
    proposedPriceRupees: 2000,
    durationMinutes: 150,
    sortOrder: 7,
  },
  {
    id: "svc-beard-trim",
    name: "Beard Trim",
    description: "A beard trim and tidy-up.",
    categoryId: "grooming",
    categoryName: "Grooming",
    proposedPriceRupees: 150,
    durationMinutes: 15,
    sortOrder: 8,
  },
  {
    id: "svc-occasion-styling",
    name: "Occasion Styling",
    description: "Styling for an occasion; the final look is discussed with you.",
    categoryId: "styling",
    categoryName: "Styling",
    proposedPriceRupees: 1200,
    durationMinutes: 60,
    sortOrder: 9,
  },
  {
    id: "svc-smoothening-consultation",
    name: "Hair Smoothening Consultation",
    description: "A consultation to discuss smoothening options.",
    categoryId: "consultation",
    categoryName: "Consultation",
    proposedPriceRupees: 0,
    durationMinutes: 30,
    sortOrder: 10,
  },
];
