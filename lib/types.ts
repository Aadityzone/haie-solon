export type AppointmentStatus =
  | "PENDING"
  | "CONFIRMED"
  | "REJECTED"
  | "CANCELLED"
  | "COMPLETED";

export interface ServiceItem {
  id: string;
  categoryId: string;
  categoryName: string;
  name: string;
  description: string | null;
  priceRupees: number | null;
  durationMinutes: number;
  isActive: boolean;
  sortOrder: number;
  /** Optional site-relative image path, e.g. "/images/gallery/gallery-2.jpg". */
  imageUrl: string | null;
  /** True once the owner has saved this row's price in the dashboard. */
  priceVerified: boolean;
}

/** One day-of-week row of the salon's opening hours, as configured by the owner. */
export interface BookingDayRule {
  dayOfWeek: number;
  dayName: string;
  isOpen: boolean;
  openTime: string;
  closeTime: string;
  breakStart: string | null;
  breakEnd: string | null;
}

/**
 * The bookable window and the reason each day in it is open or closed.
 *
 * This is what the customer date picker renders. It is derived entirely from
 * owner settings, opening hours, and blocked periods on the server, so the
 * frontend never decides on its own that a date is bookable.
 */
export interface BookingRules {
  timezone: string;
  /** Salon-local date of the first day that may be requested. */
  windowStart: string;
  /** Salon-local date of the last day that may be requested. */
  windowEnd: string;
  /** Earliest selectable date once remaining time today is accounted for. */
  minSelectableDate: string;
  maxAdvanceDays: number;
  slotIntervalMinutes: number;
  bufferMinutes: number;
  /** False when the owner has restricted requests to a single service. */
  allowMultiService: boolean;
  days: BookingDayRule[];
  /** Salon-local dates touched by an owner-blocked period. */
  blockedDates: string[];
  /** Salon-local dates that fall on a closed weekday or a misconfigured day. */
  closedDates: string[];
  /** True when at least one live service has an owner-reviewed price. */
  cataloguePricesVerified: boolean;
}

export interface SalonDayHours {
  dayOfWeek: number; // 0=Sun, 1=Mon, ..., 6=Sat
  dayName: string;
  isOpen: boolean;
  openTime: string; // "HH:MM"
  closeTime: string; // "HH:MM"
  breakStart?: string | null;
  breakEnd?: string | null;
}

export interface BlockedPeriod {
  id: string;
  startTime: string; // ISO
  endTime: string; // ISO
  reason: string;
  createdAt: string;
}

export interface AppointmentServiceSnapshot {
  id: string;
  appointmentId: string;
  serviceId: string;
  serviceName: string;
  priceRupees: number | null;
  durationMinutes: number;
}

export interface Appointment {
  id: string;
  referenceCode: string;
  customerName: string;
  customerPhone: string;
  customerNotes?: string | null;
  whatsappOptIn?: boolean;
  startTime: string; // ISO
  endTime: string; // ISO
  durationMinutes: number;
  totalPriceRupees: number | null;
  status: AppointmentStatus;
  holdExpiresAt: string; // ISO
  rejectionReason?: string | null;
  createdAt: string;
  updatedAt: string;
  services?: AppointmentServiceSnapshot[];
}

export interface CreateBookingInput {
  serviceIds: string[];
  date: string; // "YYYY-MM-DD"
  time: string; // "HH:MM"
  customerName: string;
  customerPhone: string;
  customerNotes?: string;
  whatsappOptIn?: boolean;
}

export interface SlotAvailability {
  time: string; // "HH:MM"
  available: boolean;
  reason?: string;
}
