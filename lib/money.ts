/**
 * Currency formatting for every customer- and owner-facing surface.
 *
 * Prices originate in the database as whole rupees. This module is the only
 * place that turns one into display text, so a price can never disagree between
 * the menu, the booking summary, and the confirmation.
 */

const rupeeFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

/** e.g. 1500 -> "₹1,500". */
export function formatRupees(amount: number): string {
  return rupeeFormatter.format(amount);
}

/**
 * A price total, or `null` when at least one selected service has no published
 * price. A partial total must never be shown as if it were the total.
 */
export function formatTotal(prices: { priceRupees: number | null }[]): {
  total: number | null;
  text: string;
} {
  if (prices.length === 0) return { total: 0, text: formatRupees(0) };
  if (prices.some((service) => service.priceRupees === null)) {
    return { total: null, text: "Confirmed by the salon" };
  }
  const total = prices.reduce((sum, service) => sum + (service.priceRupees ?? 0), 0);
  return { total, text: formatRupees(total) };
}

/** e.g. 105 -> "1 hr 45 min". Compact enough for a phone summary bar. */
export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} hr` : `${hours} hr ${rest} min`;
}

/** e.g. "2026-05-14" -> "Thu, 14 May 2026" in the salon's own timezone. */
export function formatSalonDate(dateStr: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(`${dateStr}T12:00:00+05:30`));
}

/** e.g. "14:30" -> "2:30 pm". Slot times are salon-local wall-clock times. */
export function formatClockTime(time: string): string {
  const [hours, minutes] = time.split(":").map(Number);
  const suffix = hours < 12 ? "am" : "pm";
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${hour12}:${String(minutes).padStart(2, "0")} ${suffix}`;
}

/** e.g. an ISO instant -> "Thu, 14 May 2026, 2:30 pm" in salon-local time. */
export function formatSalonInstant(iso: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}
