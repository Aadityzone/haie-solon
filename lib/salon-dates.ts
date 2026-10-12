/**
 * Salon-local date arithmetic.
 *
 * Every date the booking flow handles is a salon-local `YYYY-MM-DD` calendar
 * date in Asia/Kolkata, never a browser-local one, so a customer travelling or
 * a device set to another timezone still sees and submits the salon's own day.
 * IST has a fixed +05:30 offset and no daylight saving, so calendar arithmetic
 * is done in UTC on the date string alone.
 */

export const SALON_TIMEZONE = "Asia/Kolkata";

/** Salon-local day of week (0 = Sunday) for a `YYYY-MM-DD` date. */
export function salonDayOfWeek(date: string): number {
  return new Date(`${date}T12:00:00+05:30`).getDay();
}

/** Adds whole days to a salon-local date, returning a salon-local date. */
export function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

/** Whole days from `from` to `to`. Negative when `to` precedes `from`. */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** The first day of the month containing `date`. */
export function firstOfMonth(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

/** Shifts a `YYYY-MM` month key by whole months. */
export function shiftMonth(monthKey: string, months: number): string {
  const [year, month] = monthKey.split("-").map(Number);
  const value = new Date(Date.UTC(year, month - 1 + months, 1));
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Today's date in the salon's timezone. */
export function salonToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: SALON_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** Number of days a given weekday occurs in the 7 days starting at `start`. */
export function nextOccurrence(start: string, dayOfWeek: number): string {
  const offset = (dayOfWeek - salonDayOfWeek(start) + 7) % 7;
  return addDays(start, offset);
}
