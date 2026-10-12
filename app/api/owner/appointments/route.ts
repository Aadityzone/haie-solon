import { NextRequest, NextResponse } from "next/server";
import { requireOwnerAuth } from "@/lib/auth";
import { getDb, initDb } from "@/lib/db";
import {
  approveAppointment,
  cancelAppointment,
  cleanupExpiredHolds,
  completeAppointment,
  rejectAppointment,
} from "@/lib/booking-service";
import { type AppointmentStatus } from "@/lib/types";
import { istToUtcIso } from "@/lib/time-utils";
import { isUserFacing } from "@/lib/errors";
import { logError } from "@/lib/logger";

export async function GET(request: NextRequest) {
  const isAuth = await requireOwnerAuth();
  if (!isAuth) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  await initDb();
  await cleanupExpiredHolds();
  const db = getDb();

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status")?.toUpperCase();
  const date = searchParams.get("date"); // YYYY-MM-DD
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  let sql = `
    SELECT id, reference_code, customer_name, customer_phone, customer_notes,
           start_time, end_time, duration_minutes, total_price_rupees,
           status, hold_expires_at, rejection_reason, created_at, updated_at
    FROM appointments
  `;
  const conditions: string[] = [];
  const args: (string | number)[] = [];

  if (status && status !== "ALL") {
    conditions.push("status = ?");
    args.push(status);
  }

  if (date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) {
      return NextResponse.json({ success: false, error: "Invalid date. Expected YYYY-MM-DD." }, { status: 400 });
    }
    const nextDate = new Date(`${date}T00:00:00Z`);
    nextDate.setUTCDate(nextDate.getUTCDate() + 1);
    conditions.push("start_time >= ? AND start_time < ?");
    args.push(istToUtcIso(date, "00:00"), istToUtcIso(nextDate.toISOString().slice(0, 10), "00:00"));
  }
  if (from || to) {
    const validDate = (value: string | null) => Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value);
    if (!validDate(from) || !validDate(to) || Date.parse(`${to}T00:00:00Z`) < Date.parse(`${from}T00:00:00Z`) || Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`) > 6 * 86400000) {
      return NextResponse.json({ success: false, error: "Provide a valid date range of at most seven days." }, { status: 400 });
    }
    const after = new Date(`${to}T00:00:00Z`); after.setUTCDate(after.getUTCDate() + 1);
    conditions.push("start_time >= ? AND start_time < ?");
    args.push(istToUtcIso(from!, "00:00"), istToUtcIso(after.toISOString().slice(0, 10), "00:00"));
  }

  if (conditions.length > 0) {
    sql += " WHERE " + conditions.join(" AND ");
  }

  sql += " ORDER BY start_time ASC LIMIT 250;";

  const result = await db.execute({ sql, args });

  // Fetch services for each appointment
  const appointmentsWithServices = await Promise.all(
    result.rows.map(async (r) => {
      const servicesResult = await db.execute({
        sql: `SELECT service_id, service_name, price_rupees, duration_minutes 
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
          serviceId: String(s.service_id),
          serviceName: String(s.service_name),
          priceRupees: s.price_rupees !== null ? Number(s.price_rupees) : null,
          durationMinutes: Number(s.duration_minutes),
        })),
      };
    })
  );

  return NextResponse.json({ success: true, appointments: appointmentsWithServices });
}

export async function POST(request: NextRequest) {
  const isAuth = await requireOwnerAuth();
  if (!isAuth) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { action, appointmentId, reason } = body;

    if (!appointmentId || typeof appointmentId !== "string") {
      return NextResponse.json({ success: false, error: "appointmentId is required" }, { status: 400 });
    }

    switch (action) {
      case "approve":
        await approveAppointment(appointmentId);
        return NextResponse.json({ success: true, message: "Appointment approved" });

      case "reject":
        await rejectAppointment(appointmentId, reason);
        return NextResponse.json({ success: true, message: "Appointment rejected" });

      case "cancel":
        await cancelAppointment(appointmentId, reason);
        return NextResponse.json({ success: true, message: "Appointment cancelled" });

      case "complete":
        await completeAppointment(appointmentId);
        return NextResponse.json({ success: true, message: "Appointment marked completed" });

      default:
        return NextResponse.json(
          { success: false, error: `Invalid action "${action}". Must be approve, reject, cancel, or complete.` },
          { status: 400 }
        );
    }
  } catch (error: unknown) {
    logError("owner.appointments", error);
    if (isUserFacing(error)) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }
    return NextResponse.json(
      { success: false, error: "Could not update that appointment. Please refresh and try again." },
      { status: 500 }
    );
  }
}
