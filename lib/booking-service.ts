import { getDb, initDb } from "./db";
import {
  type Appointment,
  type AppointmentStatus,
  type CreateBookingInput,
  type SalonDayHours,
  type ServiceItem,
  type SlotAvailability,
} from "./types";
import {
  istToUtcIso,
  utcIsoToIstParts,
  normalizeIndianPhone,
  generateReferenceCode,
} from "./time-utils";
import { sendAppointmentNotification } from "./notifications/whatsapp";
import { SalonError } from "./errors";
import crypto from "node:crypto";
import { salonConfig } from "@/config/salon";

/**
 * Ensures DB is initialized before executing queries
 */
async function ensureDb() {
  await initDb();
  return getDb();
}

/**
 * Cleans up expired pending holds
 */
export async function cleanupExpiredHolds(): Promise<number> {
  const db = await ensureDb();
  const now = new Date().toISOString();

  const result = await db.execute({
    sql: `UPDATE appointments 
          SET status = 'CANCELLED', 
              rejection_reason = 'Pending request expired before approval',
              updated_at = ?
          WHERE status = 'PENDING' AND hold_expires_at < ?`,
    args: [now, now],
  });

  return Number(result.rowsAffected || 0);
}

/**
 * Retrieves all active services ordered by sort_order.
 *
 * Visibility is controlled solely by the owner's `is_active` flag on each row.
 * There is deliberately no name-based filtering here: the salon is a unisex
 * studio and the service catalogue must stay fully owner-configurable.
 */
export async function getActiveServices(): Promise<ServiceItem[]> {
  const db = await ensureDb();
  const result = await db.execute(
    `SELECT id, category_id, category_name, name, description, price_rupees, duration_minutes, is_active, sort_order, image_url, price_verified
     FROM services 
     WHERE is_active = 1
     ORDER BY sort_order ASC, name ASC;`
  );

  return result.rows.map((r) => ({
    id: String(r.id),
    categoryId: String(r.category_id),
    categoryName: String(r.category_name),
    name: String(r.name),
    description: r.description ? String(r.description) : null,
    priceRupees: r.price_rupees !== null ? Number(r.price_rupees) : null,
    durationMinutes: Number(r.duration_minutes),
    isActive: Boolean(r.is_active),
    sortOrder: Number(r.sort_order),
    imageUrl: r.image_url ? String(r.image_url) : null,
    priceVerified: Number(r.price_verified) === 1,
  }));
}

/**
 * Retrieves opening hours for all days of the week
 */
export async function getSalonHours(): Promise<SalonDayHours[]> {
  const db = await ensureDb();
  const result = await db.execute(
    `SELECT day_of_week, day_name, is_open, open_time, close_time, break_start, break_end 
     FROM salon_hours 
     ORDER BY day_of_week ASC;`
  );

  return result.rows.map((r) => ({
    dayOfWeek: Number(r.day_of_week),
    dayName: String(r.day_name),
    isOpen: Boolean(r.is_open),
    openTime: String(r.open_time),
    closeTime: String(r.close_time),
    breakStart: r.break_start ? String(r.break_start) : null,
    breakEnd: r.break_end ? String(r.break_end) : null,
  }));
}

/**
 * Reads the owner-configured booking settings, clamped to the ranges the rest
 * of the booking engine enforces. Every screen that quotes a booking window,
 * slot interval, or buffer reads it from here so no rule is duplicated as an
 * independent hardcoded number in the UI.
 */
export async function getBookingSettings(): Promise<{
  slotIntervalMinutes: number;
  bufferMinutes: number;
  holdMinutes: number;
  maxAdvanceDays: number;
  allowMultiService: boolean;
  timezone: string;
}> {
  const db = await ensureDb();
  const result = await db.execute(
    "SELECT key, value FROM owner_settings WHERE key IN ('slot_interval_minutes','salon_buffer_minutes','pending_hold_minutes','max_advance_booking_days','allow_multi_service','salon_timezone')"
  );
  const setting = Object.fromEntries(result.rows.map((row) => [String(row.key), String(row.value)]));

  return {
    slotIntervalMinutes: Math.max(5, Math.min(60, Number(setting.slot_interval_minutes || 15))),
    bufferMinutes: Math.max(0, Math.min(120, Number(setting.salon_buffer_minutes || 0))),
    holdMinutes: Math.max(5, Math.min(1440, Number(setting.pending_hold_minutes || 30))),
    maxAdvanceDays: Math.max(1, Math.min(365, Number(setting.max_advance_booking_days || 30))),
    allowMultiService: String(setting.allow_multi_service ?? "true") !== "false",
    timezone: "Asia/Kolkata",
  };
}

/**
 * The authoritative shape of the bookable window, and the reason each day in it
 * is or is not selectable.
 *
 * The customer-facing date picker renders exactly these facts. It never decides
 * for itself whether a date is bookable: a greyed-out day carries the salon's
 * own reason, and a day marked open is still re-checked by `getAvailableSlots`
 * and again inside the booking transaction.
 *
 * `durationMinutes` is optional and only tightens one thing: when the combined
 * duration of the chosen services no longer fits in what is left of today, the
 * earliest selectable date moves to tomorrow.
 */
export async function getBookingRules(durationMinutes = 0): Promise<{
  timezone: string;
  windowStart: string;
  windowEnd: string;
  minSelectableDate: string;
  maxAdvanceDays: number;
  slotIntervalMinutes: number;
  bufferMinutes: number;
  allowMultiService: boolean;
  days: { dayOfWeek: number; dayName: string; isOpen: boolean; openTime: string; closeTime: string; breakStart: string | null; breakEnd: string | null }[];
  blockedDates: string[];
  closedDates: string[];
  cataloguePricesVerified: boolean;
}> {
  const db = await ensureDb();
  await cleanupExpiredHolds();

  const settings = await getBookingSettings();
  const hours = await getSalonHours();
  const today = utcIsoToIstParts(new Date().toISOString()).date;
  const windowEnd = addDays(today, settings.maxAdvanceDays);

  // Blocked periods are stored as instants, so every date the period touches in
  // salon-local time is collected rather than only its start date.
  const blockedDates = new Set<string>();
  const blockedResult = await db.execute(
    "SELECT start_time, end_time FROM blocked_periods WHERE end_time > ? AND start_time < ?",
    [istToUtcIso(today, "00:00"), istToUtcIso(addDays(windowEnd, 1), "00:00")]
  );
  for (const row of blockedResult.rows) {
    const lastTouched = utcIsoToIstParts(new Date(Date.parse(String(row.end_time)) - 1).toISOString()).date;
    const firstTouched = utcIsoToIstParts(String(row.start_time)).date;
    let cursor = firstTouched < today ? today : firstTouched;
    let guard = 0;
    while (cursor <= lastTouched && cursor <= windowEnd && guard++ < 400) {
      blockedDates.add(cursor);
      cursor = addDays(cursor, 1);
    }
  }

  const closedDates: string[] = [];
  for (let offset = 0; offset <= settings.maxAdvanceDays; offset++) {
    const date = addDays(today, offset);
    const dayOfWeek = new Date(`${date}T12:00:00+05:30`).getDay();
    const day = hours.find((entry) => entry.dayOfWeek === dayOfWeek);
    if (!day || !day.isOpen || String(day.openTime) >= String(day.closeTime)) closedDates.push(date);
  }

  // If nothing is left of today for this duration, the earliest a customer can
  // meaningfully choose is tomorrow.
  let minSelectableDate = today;
  if (durationMinutes > 0) {
    const remaining = await getAvailableSlots(today, durationMinutes);
    if (!remaining.salonOpen || !remaining.slots.some((slot) => slot.available)) {
      minSelectableDate = addDays(today, 1);
    }
  }

  const verified = await db.execute(
    "SELECT count(*) AS count FROM services WHERE is_active = 1 AND price_verified = 1"
  );

  return {
    timezone: settings.timezone,
    windowStart: today,
    windowEnd,
    minSelectableDate,
    maxAdvanceDays: settings.maxAdvanceDays,
    slotIntervalMinutes: settings.slotIntervalMinutes,
    bufferMinutes: settings.bufferMinutes,
    allowMultiService: settings.allowMultiService,
    days: hours.map((day) => ({
      dayOfWeek: day.dayOfWeek,
      dayName: day.dayName,
      isOpen: day.isOpen,
      openTime: day.openTime,
      closeTime: day.closeTime,
      breakStart: day.breakStart ?? null,
      breakEnd: day.breakEnd ?? null,
    })),
    blockedDates: Array.from(blockedDates).sort(),
    closedDates,
    cataloguePricesVerified: Number(verified.rows[0]?.count || 0) > 0,
  };
}

/** Adds whole days to a `YYYY-MM-DD` string without leaving UTC arithmetic. */
function addDays(dateStr: string, days: number): string {
  const parsed = new Date(`${dateStr}T00:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

/**
 * Calculates available time slots for a given date and duration
 */
export async function getAvailableSlots(
  dateStr: string, // YYYY-MM-DD
  durationMinutes: number
): Promise<{ date: string; slots: SlotAvailability[]; salonOpen: boolean; reason?: string }> {
  const db = await ensureDb();
  await cleanupExpiredHolds();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    throw new SalonError("Invalid date format. Expected YYYY-MM-DD.");
  }
  const [dateYear, dateMonth, dateDay] = dateStr.split("-").map(Number);
  const parsed = new Date(Date.UTC(dateYear, dateMonth - 1, dateDay));
  if (parsed.getUTCFullYear() !== dateYear || parsed.getUTCMonth() !== dateMonth - 1 || parsed.getUTCDate() !== dateDay) throw new SalonError("Invalid calendar date.");
  const settings = await getBookingSettings();
  const slotInterval = settings.slotIntervalMinutes;
  const bufferMinutes = settings.bufferMinutes;
  const reservedDuration = durationMinutes + bufferMinutes;
  const currentDate = utcIsoToIstParts(new Date().toISOString()).date;
  const maxDays = settings.maxAdvanceDays;
  const dayOffset = (parsed.getTime() - Date.parse(`${currentDate}T00:00:00Z`)) / 86400000;
  if (dayOffset < 0 || dayOffset > maxDays) return { date: dateStr, slots: [], salonOpen: false, reason: `Choose a date within the next ${maxDays} days.` };

  // Determine day of week in Asia/Kolkata
  const dummyIst = new Date(`${dateStr}T12:00:00+05:30`);
  const dayOfWeek = dummyIst.getDay();

  // Fetch hours for that day
  const hoursResult = await db.execute({
    sql: `SELECT is_open, open_time, close_time, break_start, break_end FROM salon_hours WHERE day_of_week = ?`,
    args: [dayOfWeek],
  });

  if (hoursResult.rows.length === 0 || !Number(hoursResult.rows[0].is_open)) {
    return { date: dateStr, slots: [], salonOpen: false, reason: "Salon is closed on this day." };
  }

  const { open_time, close_time, break_start, break_end } = hoursResult.rows[0];
  const openTimeStr = String(open_time);
  const closeTimeStr = String(close_time);

  // Parse open and close into minutes from midnight
  const [openH, openM] = openTimeStr.split(":").map(Number);
  const [closeH, closeM] = closeTimeStr.split(":").map(Number);
  const openTotalM = openH * 60 + openM;
  const closeTotalM = closeH * 60 + closeM;

  // Break period in minutes if defined
  let breakStartM = -1;
  let breakEndM = -1;
  if (break_start && break_end) {
    const [bsH, bsM] = String(break_start).split(":").map(Number);
    const [beH, beM] = String(break_end).split(":").map(Number);
    breakStartM = bsH * 60 + bsM;
    breakEndM = beH * 60 + beM;
  }

  // Fetch existing appointments on that date in UTC
  const dayStartIso = istToUtcIso(dateStr, "00:00");
  const dayEndIso = istToUtcIso(dateStr, "23:59");
  const nowIso = new Date().toISOString();

  // Active appointments overlapping this date
  const apptsResult = await db.execute({
    sql: `SELECT start_time, end_time FROM appointments 
          WHERE (
            status = 'CONFIRMED' 
            OR (status = 'PENDING' AND hold_expires_at > ?)
          )
          AND NOT (end_time <= ? OR start_time >= ?)`,
    args: [nowIso, dayStartIso, dayEndIso],
  });

  // Blocked periods overlapping this date
  const blocksResult = await db.execute({
    sql: `SELECT start_time, end_time, reason FROM blocked_periods 
          WHERE NOT (end_time <= ? OR start_time >= ?)`,
    args: [dayStartIso, dayEndIso],
  });

  // Current time in IST to filter out past slots if date is today
  const istNow = utcIsoToIstParts(nowIso);
  const isToday = istNow.date === dateStr;
  const [nowH, nowM] = istNow.time.split(":").map(Number);
  const nowTotalM = nowH * 60 + nowM + 15; // 15 mins advance notice minimum

  const slots: SlotAvailability[] = [];
  const slotStep = slotInterval;

  for (let m = openTotalM; m + reservedDuration <= closeTotalM; m += slotStep) {
    const slotHour = String(Math.floor(m / 60)).padStart(2, "0");
    const slotMin = String(m % 60).padStart(2, "0");
    const slotTime = `${slotHour}:${slotMin}`;

    // If today and time has passed
    if (isToday && m < nowTotalM) {
      slots.push({ time: slotTime, available: false, reason: "Time has passed" });
      continue;
    }

    // Check if slot + duration collides with break
    if (breakStartM !== -1 && breakEndM !== -1) {
      const slotEndM = m + reservedDuration;
      if (m < breakEndM && slotEndM > breakStartM) {
        slots.push({ time: slotTime, available: false, reason: "Salon break time" });
        continue;
      }
    }

    // Convert slot start and end to UTC ISO
    const slotStartIso = istToUtcIso(dateStr, slotTime);
    const slotEndM = m + reservedDuration;
    const slotEndHour = String(Math.floor(slotEndM / 60)).padStart(2, "0");
    const slotEndMin = String(slotEndM % 60).padStart(2, "0");
    const slotEndIso = istToUtcIso(dateStr, `${slotEndHour}:${slotEndMin}`);

    // Check overlap with appointments
    let hasConflict = false;
    for (const appt of apptsResult.rows) {
      const apptStart = String(appt.start_time);
      const apptEnd = String(appt.end_time);
      if (slotStartIso < apptEnd && slotEndIso > apptStart) {
        hasConflict = true;
        break;
      }
    }

    if (hasConflict) {
      slots.push({ time: slotTime, available: false, reason: "Slot already reserved" });
      continue;
    }

    // Check overlap with blocked periods
    for (const block of blocksResult.rows) {
      const bStart = String(block.start_time);
      const bEnd = String(block.end_time);
      if (slotStartIso < bEnd && slotEndIso > bStart) {
        hasConflict = true;
        break;
      }
    }

    if (hasConflict) {
      slots.push({ time: slotTime, available: false, reason: "Blocked by salon" });
      continue;
    }

    slots.push({ time: slotTime, available: true });
  }

  return { date: dateStr, slots, salonOpen: true };
}

/**
 * Creates a new booking request inside an exclusive write transaction.
 * Concurrency safe: prevents overlapping reservations for the salon.
 */
export async function createBookingRequest(input: CreateBookingInput): Promise<Appointment> {
  const db = await ensureDb();

  // Validate inputs
  const customerName = input.customerName?.trim();
  if (!customerName || customerName.length < 2) {
    throw new SalonError("Please enter your name (at least 2 characters).");
  }

  const phoneValidation = normalizeIndianPhone(input.customerPhone);
  if (!phoneValidation.valid) {
    throw new SalonError(phoneValidation.error || "Invalid mobile number.");
  }
  const customerPhone = phoneValidation.normalized;

  if (!Array.isArray(input.serviceIds) || input.serviceIds.length === 0 || input.serviceIds.length > 8 ||
      input.serviceIds.some((id) => typeof id !== "string") || new Set(input.serviceIds).size !== input.serviceIds.length) {
    throw new SalonError("Please select at least one service.");
  }

  if (typeof input.date !== "string" || typeof input.time !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(input.date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(input.time)) {
    throw new SalonError("Invalid date or time format.");
  }
  const [year, month, day] = input.date.split("-").map(Number);
  const parsedDate = new Date(Date.UTC(year, month - 1, day));
  if (parsedDate.getUTCFullYear() !== year || parsedDate.getUTCMonth() !== month - 1 || parsedDate.getUTCDate() !== day) {
    throw new SalonError("Invalid appointment date.");
  }
  if (typeof input.customerNotes === "string" && input.customerNotes.length > 1000) {
    throw new SalonError("Notes must be 1000 characters or fewer.");
  }

  // Validate date is not in the past and within 30 days
  const nowIso = new Date().toISOString();
  const istNow = utcIsoToIstParts(nowIso);
  if (input.date < istNow.date) {
    throw new SalonError("Cannot book an appointment in the past.");
  }

  const bookingSettings = await getBookingSettings();
  const maxAdvanceDays = bookingSettings.maxAdvanceDays;
  const lastBookable = new Date(Date.UTC(year, month - 1, day));
  const today = new Date(`${istNow.date}T00:00:00Z`);
  if (Math.floor((lastBookable.getTime() - today.getTime()) / 86400000) > maxAdvanceDays) {
    throw new SalonError(`Appointments can be booked up to ${maxAdvanceDays} days ahead.`);
  }
  const slotInterval = bookingSettings.slotIntervalMinutes;
  const requestedMinute = Number(input.time.split(":")[1]);
  if (requestedMinute % slotInterval !== 0) throw new SalonError(`Appointment time must be on a ${slotInterval}-minute interval.`);

  // Fetch requested services from database
  const placeholders = input.serviceIds.map(() => "?").join(",");
  const servicesResult = await db.execute({
    sql: `SELECT id, name, price_rupees, duration_minutes, is_active 
          FROM services 
          WHERE id IN (${placeholders})`,
    args: input.serviceIds,
  });

  if (servicesResult.rows.length !== input.serviceIds.length) {
    throw new SalonError("One or more selected services are invalid.");
  }

  // Check all active
  for (const s of servicesResult.rows) {
    if (!Number(s.is_active)) {
      throw new SalonError(`Service "${s.name}" is currently inactive and cannot be booked.`);
    }
  }

  const selectedServices = servicesResult.rows.map((r) => ({
    id: String(r.id),
    name: String(r.name),
    price: r.price_rupees !== null ? Number(r.price_rupees) : null,
    duration: Number(r.duration_minutes),
  }));

  const totalDuration = selectedServices.reduce((sum, s) => sum + s.duration, 0);
  if (totalDuration <= 0 || totalDuration > 480) throw new SalonError("Selected services have an invalid total duration.");
  const totalPrice = selectedServices.every((service) => service.price !== null)
    ? selectedServices.reduce((sum, service) => sum + (service.price ?? 0), 0)
    : null;

  // Calculate start & end times in UTC ISO
  const startTimeIso = istToUtcIso(input.date, input.time);
  if (Date.parse(startTimeIso) < Date.now() + 15 * 60 * 1000) {
    throw new SalonError("Please choose a time at least 15 minutes from now.");
  }
  const [startH, startM] = input.time.split(":").map(Number);
  const bufferMinutes = bookingSettings.bufferMinutes;
  const totalEndM = startH * 60 + startM + totalDuration + bufferMinutes;
  const endHour = String(Math.floor(totalEndM / 60)).padStart(2, "0");
  const endMin = String(totalEndM % 60).padStart(2, "0");
  const endTimeIso = istToUtcIso(input.date, `${endHour}:${endMin}`);

  // Re-verify opening hours
  const istDateObj = new Date(`${input.date}T12:00:00+05:30`);
  const dayOfWeek = istDateObj.getDay();
  const hoursResult = await db.execute({
    sql: `SELECT is_open, open_time, close_time, break_start, break_end FROM salon_hours WHERE day_of_week = ?`,
    args: [dayOfWeek],
  });

  if (!hoursResult.rows.length || !Number(hoursResult.rows[0].is_open)) {
    throw new SalonError("The salon is closed on this day.");
  }

  const openTime = String(hoursResult.rows[0].open_time);
  const closeTime = String(hoursResult.rows[0].close_time);
  const [cH, cM] = closeTime.split(":").map(Number);
  const [oH, oM] = openTime.split(":").map(Number);
  const closeTotalM = cH * 60 + cM;
  const openTotalM = oH * 60 + oM;
  const startTotalM = startH * 60 + startM;

  if (startTotalM < openTotalM || totalEndM > closeTotalM) {
    throw new SalonError(`Appointment must be within salon hours (${openTime} – ${closeTime}).`);
  }
  const { break_start: breakStart, break_end: breakEnd } = hoursResult.rows[0];
  if (breakStart && breakEnd) {
    const [bsh, bsm] = String(breakStart).split(":").map(Number);
    const [beh, bem] = String(breakEnd).split(":").map(Number);
    const breakStartM = bsh * 60 + bsm;
    const breakEndM = beh * 60 + bem;
    if (startTotalM < breakEndM && totalEndM > breakStartM) throw new SalonError("The selected time overlaps the salon break.");
  }

  // BEGIN EXCLUSIVE WRITE TRANSACTION
  const tx = await db.transaction("write");

  try {
    // 1. Expire stale holds
    const currentIso = new Date().toISOString();
    await tx.execute({
      sql: `UPDATE appointments 
            SET status = 'CANCELLED', rejection_reason = 'Hold expired' 
            WHERE status = 'PENDING' AND hold_expires_at < ?`,
      args: [currentIso],
    });

    // 2. Overlap check against appointments
    const conflictResult = await tx.execute({
      sql: `SELECT id, status, reference_code FROM appointments 
            WHERE (
              status = 'CONFIRMED' 
              OR (status = 'PENDING' AND hold_expires_at > ?)
            )
            AND NOT (end_time <= ? OR start_time >= ?)`,
      args: [currentIso, startTimeIso, endTimeIso],
    });

    if (conflictResult.rows.length > 0) {
      throw new SalonError("SLOT_UNAVAILABLE: This time slot is already reserved. Please select another time.");
    }

    // 3. Overlap check against blocked periods
    const blockConflict = await tx.execute({
      sql: `SELECT id, reason FROM blocked_periods 
            WHERE NOT (end_time <= ? OR start_time >= ?)`,
      args: [startTimeIso, endTimeIso],
    });

    if (blockConflict.rows.length > 0) {
      throw new SalonError(`SLOT_BLOCKED: The salon is unavailable during this period (${blockConflict.rows[0].reason}).`);
    }

    // 4. Generate ID, reference code, hold expiration (15 minutes from now)
    const appointmentId = crypto.randomUUID();
    const referenceCode = generateReferenceCode();
    const holdMinutes = bookingSettings.holdMinutes;
    const holdExpiresAt = new Date(Date.now() + holdMinutes * 60 * 1000).toISOString();
    const createdAt = currentIso;

    // 5. Insert appointment
    await tx.execute({
      sql: `INSERT INTO appointments (
              id, reference_code, customer_name, customer_phone, customer_notes, whatsapp_opt_in,
              start_time, end_time, duration_minutes, total_price_rupees,
              status, hold_expires_at, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?, ?)`,
      args: [
        appointmentId,
        referenceCode,
        customerName,
        customerPhone,
        input.customerNotes?.trim() || null,
        input.whatsappOptIn ? 1 : 0,
        startTimeIso,
        endTimeIso,
        totalDuration,
        totalPrice,
        holdExpiresAt,
        createdAt,
        createdAt,
      ],
    });

    // 6. Insert snapshot into appointment_services
    for (const s of selectedServices) {
      const snapId = crypto.randomUUID();
      await tx.execute({
        sql: `INSERT INTO appointment_services (
                id, appointment_id, service_id, service_name, price_rupees, duration_minutes
              ) VALUES (?, ?, ?, ?, ?, ?)`,
        args: [snapId, appointmentId, s.id, s.name, s.price, s.duration],
      });
    }

    // 7. Commit transaction
    await tx.commit();

    const istParts = utcIsoToIstParts(startTimeIso);
    const servicesText = selectedServices.map((s) => s.name).join(", ");

    // Trigger asynchronous notification to owner
    sendAppointmentNotification({
      appointmentId,
      recipientPhone: salonConfig.contact.phone,
      recipientRole: "OWNER",
      eventType: "NEW_REQUEST",
      details: {
        referenceCode,
        customerName,
        customerPhone,
        servicesText,
        dateTimeText: `${istParts.displayDate} at ${istParts.displayTime}`,
        totalPriceText: totalPrice === null ? "Price to be confirmed with the salon" : `₹${totalPrice}`,
        durationText: `${totalDuration} minutes`,
        notes: input.customerNotes?.trim(),
      },
    }).catch((err) => console.error("Notification trigger error:", err));

    return {
      id: appointmentId,
      referenceCode,
      customerName,
      customerPhone,
      customerNotes: input.customerNotes?.trim() || null,
      startTime: startTimeIso,
      endTime: endTimeIso,
      durationMinutes: totalDuration,
      totalPriceRupees: totalPrice,
      status: "PENDING",
      holdExpiresAt,
      createdAt,
      updatedAt: createdAt,
      services: selectedServices.map((s) => ({
        id: "",
        appointmentId,
        serviceId: s.id,
        serviceName: s.name,
        priceRupees: s.price,
        durationMinutes: s.duration,
      })),
    };
  } catch (err) {
    await tx.rollback();
    throw err;
  }
}

/**
 * Retrieves appointment details by reference code (sanitized for customer view).
 *
 * A booking reference alone is treated as a capability token, so every
 * customer-facing caller must also supply the mobile number the booking was made
 * with. When `verifyPhone` is given and does not match, this returns null — the
 * route then answers 404, so a wrong reference and a wrong number are
 * indistinguishable and neither confirms that a reference exists.
 */
export async function getAppointmentByReference(referenceCode: string, verifyPhone?: string): Promise<Appointment | null> {
  const db = await ensureDb();
  await cleanupExpiredHolds();

  const args: string[] = [referenceCode.toUpperCase().trim()];
  let phoneFilter = "";
  if (verifyPhone !== undefined) {
    const normalized = verifyPhone.replace(/\s|-|\(|\)/g, "");
    const digits = normalized.startsWith("+") ? normalized.slice(1) : normalized;
    const canonical = /^91\d{10}$/.test(digits) ? `+${digits}` : /^[6-9]\d{9}$/.test(digits) ? `+91${digits}` : null;
    if (canonical === null) return null;
    phoneFilter = " AND customer_phone = ?";
    args.push(canonical);
  }

  const apptResult = await db.execute({
    sql: `SELECT id, reference_code, customer_name, customer_phone, customer_notes,
                 start_time, end_time, duration_minutes, total_price_rupees,
                 status, hold_expires_at, rejection_reason, created_at, updated_at
          FROM appointments
          WHERE reference_code = ?${phoneFilter}`,
    args,
  });

  if (apptResult.rows.length === 0) return null;
  const r = apptResult.rows[0];

  const servicesResult = await db.execute({
    sql: `SELECT id, service_id, service_name, price_rupees, duration_minutes 
          FROM appointment_services 
          WHERE appointment_id = ?`,
    args: [r.id],
  });

  return {
    id: String(r.id),
    referenceCode: String(r.reference_code),
    customerName: String(r.customer_name),
    customerPhone: String(r.customer_phone),
    customerNotes: r.customer_notes ? String(r.customer_notes) : null,
    startTime: String(r.start_time),
    endTime: String(r.end_time),
    durationMinutes: Number(r.duration_minutes),
    totalPriceRupees: r.total_price_rupees !== null ? Number(r.total_price_rupees) : null,
    status: String(r.status) as AppointmentStatus,
    holdExpiresAt: String(r.hold_expires_at),
    rejectionReason: r.rejection_reason ? String(r.rejection_reason) : null,
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
    services: servicesResult.rows.map((s) => ({
      id: String(s.id),
      appointmentId: String(r.id),
      serviceId: String(s.service_id),
      serviceName: String(s.service_name),
      priceRupees: s.price_rupees !== null ? Number(s.price_rupees) : null,
      durationMinutes: Number(s.duration_minutes),
    })),
  };
}

/**
 * Owner Action: Approve appointment with atomic conflict recheck
 */
export async function approveAppointment(appointmentId: string): Promise<void> {
  const db = await ensureDb();
  const tx = await db.transaction("write");

  try {
    const apptResult = await tx.execute({
      sql: `SELECT id, reference_code, customer_name, customer_phone, start_time, end_time, status, hold_expires_at, whatsapp_opt_in, duration_minutes, total_price_rupees
            FROM appointments WHERE id = ?`,
      args: [appointmentId],
    });

    if (apptResult.rows.length === 0) throw new SalonError("Appointment not found.");
    const appt = apptResult.rows[0];

    if (appt.status === "CONFIRMED") throw new SalonError("Appointment is already confirmed.");
    if (appt.status === "CANCELLED" || appt.status === "REJECTED") {
      throw new SalonError(`Cannot approve appointment in ${appt.status} status.`);
    }
    if (appt.status !== "PENDING" || Date.parse(String(appt.hold_expires_at || 0)) <= Date.now()) {
      throw new SalonError("This pending reservation has expired.");
    }
    const startLocal = utcIsoToIstParts(String(appt.start_time));
    const endLocal = utcIsoToIstParts(String(appt.end_time));
    const currentHours = await tx.execute({ sql: "SELECT is_open, open_time, close_time, break_start, break_end FROM salon_hours WHERE day_of_week = ?", args: [startLocal.dayOfWeek] });
    if (!currentHours.rows.length || !Number(currentHours.rows[0].is_open) || startLocal.time < String(currentHours.rows[0].open_time) || endLocal.time > String(currentHours.rows[0].close_time)) {
      throw new SalonError("The salon's current opening hours no longer cover this appointment.");
    }
    const approvalHours = currentHours.rows[0];
    if (approvalHours.break_start && approvalHours.break_end && startLocal.time < String(approvalHours.break_end) && endLocal.time > String(approvalHours.break_start)) {
      throw new SalonError("This appointment now overlaps the salon break.");
    }

    // Recheck for any other CONFIRMED appointments overlapping this window
    const conflict = await tx.execute({
      sql: `SELECT id, reference_code FROM appointments 
            WHERE id != ? AND (status = 'CONFIRMED' OR (status = 'PENDING' AND hold_expires_at > ?))
            AND NOT (end_time <= ? OR start_time >= ?)`,
      args: [appointmentId, new Date().toISOString(), appt.start_time, appt.end_time],
    });

    if (conflict.rows.length > 0) {
      throw new SalonError(
        `Conflict detected: Confirmed booking [${conflict.rows[0].reference_code}] overlaps this time interval.`
      );
    }

    // Recheck blocked periods
    const blockConflict = await tx.execute({
      sql: `SELECT id, reason FROM blocked_periods 
            WHERE NOT (end_time <= ? OR start_time >= ?)`,
      args: [appt.start_time, appt.end_time],
    });

    if (blockConflict.rows.length > 0) {
      throw new SalonError(`Conflict detected: Time is blocked (${blockConflict.rows[0].reason}).`);
    }

    const now = new Date().toISOString();
    await tx.execute({
      sql: `UPDATE appointments SET status = 'CONFIRMED', rejection_reason = NULL, updated_at = ? WHERE id = ?`,
      args: [now, appointmentId],
    });

    await tx.commit();

    // Fetch services for notification
    const servicesResult = await db.execute({
      sql: `SELECT service_name, price_rupees, duration_minutes FROM appointment_services WHERE appointment_id = ?`,
      args: [appointmentId],
    });
    const servicesText = servicesResult.rows.map((s) => `${s.service_name} (${s.duration_minutes} min${s.price_rupees == null ? "" : `, ₹${s.price_rupees}`})`).join(", ");
    const istParts = utcIsoToIstParts(String(appt.start_time));

      sendAppointmentNotification({
      appointmentId,
      recipientPhone: String(appt.customer_phone),
      recipientRole: "CUSTOMER",
      eventType: "CONFIRMED",
      customerOptedIn: Boolean(appt.whatsapp_opt_in),
      details: {
        referenceCode: String(appt.reference_code),
        customerName: String(appt.customer_name),
        customerPhone: String(appt.customer_phone),
        servicesText,
        dateTimeText: `${istParts.displayDate} at ${istParts.displayTime}`,
        totalPriceText: appt.total_price_rupees == null ? "Price to be confirmed with the salon" : `₹${appt.total_price_rupees}`,
        durationText: `${appt.duration_minutes} mins`,
      },
    }).catch((err) => console.error("Notification error:", err));
  } catch (err) {
    await tx.rollback();
    throw err;
  }
}

/**
 * Owner Action: Reject appointment
 */
export async function rejectAppointment(appointmentId: string, reason?: string): Promise<void> {
  const db = await ensureDb();
  const now = new Date().toISOString();
  const tx = await db.transaction("write");
  let appt;
  try {
    const result = await tx.execute({ sql: "SELECT id, reference_code, customer_name, customer_phone, start_time, duration_minutes, status, whatsapp_opt_in FROM appointments WHERE id = ?", args: [appointmentId] });
    if (!result.rows.length) throw new SalonError("Appointment not found.");
    appt = result.rows[0];
    if (appt.status !== "PENDING") throw new SalonError(`Cannot reject appointment in ${appt.status} status.`);
    await tx.execute({ sql: "UPDATE appointments SET status = 'REJECTED', rejection_reason = ?, updated_at = ? WHERE id = ? AND status = 'PENDING'", args: [reason?.trim().slice(0, 500) || "Slot unavailable", now, appointmentId] });
    await tx.commit();
  } catch (error) { await tx.rollback(); throw error; }

  const istParts = utcIsoToIstParts(String(appt.start_time));

  sendAppointmentNotification({
    appointmentId,
    recipientPhone: String(appt.customer_phone),
    recipientRole: "CUSTOMER",
    eventType: "REJECTED",
    customerOptedIn: Boolean(appt.whatsapp_opt_in),
    details: {
      referenceCode: String(appt.reference_code),
      customerName: String(appt.customer_name),
      customerPhone: String(appt.customer_phone),
      servicesText: "",
      dateTimeText: `${istParts.displayDate} at ${istParts.displayTime}`,
      totalPriceText: "",
      durationText: `${appt.duration_minutes} mins`,
      rejectionReason: reason?.trim() || "Slot unavailable",
    },
  }).catch((err) => console.error("Notification error:", err));
}

/**
 * Owner Action: Cancel confirmed appointment
 */
export async function cancelAppointment(appointmentId: string, reason?: string): Promise<void> {
  const db = await ensureDb();
  const now = new Date().toISOString();
  const tx = await db.transaction("write");
  let appt;
  try {
    const result = await tx.execute({ sql: "SELECT id, reference_code, customer_name, customer_phone, start_time, duration_minutes, status, whatsapp_opt_in FROM appointments WHERE id = ?", args: [appointmentId] });
    if (!result.rows.length) throw new SalonError("Appointment not found.");
    appt = result.rows[0];
    if (appt.status !== "CONFIRMED" && appt.status !== "PENDING") throw new SalonError(`Cannot cancel appointment in ${appt.status} status.`);
    await tx.execute({ sql: "UPDATE appointments SET status = 'CANCELLED', rejection_reason = ?, updated_at = ? WHERE id = ? AND status IN ('CONFIRMED', 'PENDING')", args: [reason?.trim().slice(0, 500) || "Cancelled by salon", now, appointmentId] });
    await tx.commit();
  } catch (error) { await tx.rollback(); throw error; }

  const istParts = utcIsoToIstParts(String(appt.start_time));

  sendAppointmentNotification({
    appointmentId,
    recipientPhone: String(appt.customer_phone),
    recipientRole: "CUSTOMER",
    eventType: "CANCELLED",
    customerOptedIn: Boolean(appt.whatsapp_opt_in),
    details: {
      referenceCode: String(appt.reference_code),
      customerName: String(appt.customer_name),
      customerPhone: String(appt.customer_phone),
      servicesText: "",
      dateTimeText: `${istParts.displayDate} at ${istParts.displayTime}`,
      totalPriceText: "",
      durationText: `${appt.duration_minutes} mins`,
      rejectionReason: reason?.trim() || "Cancelled by salon",
    },
  }).catch((err) => console.error("Notification error:", err));
}

/**
 * Owner Action: Mark appointment completed
 */
export async function completeAppointment(appointmentId: string): Promise<void> {
  const db = await ensureDb();
  const now = new Date().toISOString();

  const result = await db.execute({
    sql: `UPDATE appointments SET status = 'COMPLETED', updated_at = ? WHERE id = ? AND status = 'CONFIRMED' AND end_time <= ?`,
    args: [now, appointmentId, now],
  });
  if (!result.rowsAffected) throw new SalonError("Only confirmed appointments that have ended can be completed.");
}
