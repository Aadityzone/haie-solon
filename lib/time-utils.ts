/**
 * Timezone and Date Utility Functions
 * Salon timezone: Asia/Kolkata (IST = UTC + 5:30)
 */

export const SALON_TIMEZONE = "Asia/Kolkata";
export const IST_OFFSET_MINUTES = 330; // +05:30

/**
 * Creates an ISO UTC timestamp from a date ("YYYY-MM-DD") and time ("HH:MM") in Asia/Kolkata
 */
export function istToUtcIso(dateStr: string, timeStr: string): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  const [hours, minutes] = timeStr.split(":").map(Number);

  // In IST, date is UTC - 5:30
  // Construct date in UTC using the offsets
  const utcDate = new Date(Date.UTC(year, month - 1, day, hours - 5, minutes - 30));
  return utcDate.toISOString();
}

/**
 * Converts an ISO string into Date components in Asia/Kolkata
 */
export function utcIsoToIstParts(isoStr: string): {
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  dayOfWeek: number; // 0-6
  displayDate: string;
  displayTime: string;
} {
  const d = new Date(isoStr);

  const formatter = new Intl.DateTimeFormat("en-IN", {
    timeZone: SALON_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    weekday: "short",
  });

  const parts = formatter.formatToParts(d);
  const find = (type: string) => parts.find((p) => p.type === type)?.value || "";

  const day = find("day");
  const month = find("month");
  const year = find("year");
  const hour = find("hour");
  const minute = find("minute");

  const dateStr = `${year}-${month}-${day}`;
  const timeStr = `${hour}:${minute}`;

  // Find day of week (0=Sunday)
  // Calculate day of week based on IST date
  const istDateObj = new Date(`${dateStr}T${timeStr}:00+05:30`);
  const dayOfWeek = istDateObj.getDay();

  const displayFormatter = new Intl.DateTimeFormat("en-IN", {
    timeZone: SALON_TIMEZONE,
    dateStyle: "medium",
    timeStyle: "short",
  });

  const timeFormatter12 = new Intl.DateTimeFormat("en-IN", {
    timeZone: SALON_TIMEZONE,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  return {
    date: dateStr,
    time: timeStr,
    dayOfWeek,
    displayDate: displayFormatter.format(d),
    displayTime: timeFormatter12.format(d),
  };
}

/**
 * Formats a phone number for India (+91)
 */
export function normalizeIndianPhone(input: string): { valid: boolean; normalized: string; error?: string } {
  // Strip non-digits except initial '+'
  let cleaned = input.trim().replace(/[\s\-()]/g, "");

  if (cleaned.startsWith("+")) {
    cleaned = cleaned.substring(1);
  }

  // If starts with 91 and has 12 digits (e.g. 916280866359)
  if (cleaned.startsWith("91") && cleaned.length === 12) {
    cleaned = cleaned.substring(2);
  } else if (cleaned.startsWith("0") && cleaned.length === 11) {
    cleaned = cleaned.substring(1);
  }

  // An Indian mobile number must have 10 digits starting with 6, 7, 8, or 9
  if (!/^[6-9]\d{9}$/.test(cleaned)) {
    return {
      valid: false,
      normalized: input,
      error: "Please enter a valid 10-digit Indian mobile number (e.g. 62808 66359)",
    };
  }

  return {
    valid: true,
    normalized: `+91${cleaned}`,
  };
}

/**
 * Generates an uppercase unique human reference code: BK-XXXX
 */
export function generateReferenceCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "BK-";
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}
