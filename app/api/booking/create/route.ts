import { NextRequest, NextResponse } from "next/server";
import { createBookingRequest } from "@/lib/booking-service";
import { databaseErrorContext } from "@/lib/db";
import { isUserFacing, stripInternalCode } from "@/lib/errors";
import { logError } from "@/lib/logger";
import { rateLimit, clientIp, rateLimitHeaders, RATE_LIMITS } from "@/lib/rate-limit";

/**
 * The ceiling is raised only when the deployment explicitly sets
 * `BOOKING_RATE_LIMIT_MAX`, which the browser suite does for its own
 * single-process server so that one run's requests do not exhaust the budget.
 * Left unset — as in every real deployment — the default applies.
 *
 * Clamped, because the variable used to accept any positive integer: a typo or a
 * compromised environment could otherwise turn the limit off entirely.
 */
const MAX_CONFIGURABLE_CEILING = 10_000;

function requestCeiling(): number {
  const configured = Number(process.env.BOOKING_RATE_LIMIT_MAX);
  if (!Number.isInteger(configured) || configured <= 0) return RATE_LIMITS.create.limit;
  return Math.min(configured, MAX_CONFIGURABLE_CEILING);
}

export async function POST(request: NextRequest) {
  try {
    const limit = await rateLimit("booking-create", clientIp(request), requestCeiling(), RATE_LIMITS.create.windowMs);
    if (!limit.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: "Too many booking requests from your network. Please wait a few minutes before trying again.",
        },
        { status: 429, headers: rateLimitHeaders(limit) }
      );
    }

    const body = await request.json();

    const appointment = await createBookingRequest({
      serviceIds: body.serviceIds,
      date: body.date,
      time: body.time,
      customerName: body.customerName,
      customerPhone: body.customerPhone,
      customerNotes: body.customerNotes,
      whatsappOptIn: body.whatsappOptIn === true,
    });

    return NextResponse.json({
      success: true,
      referenceCode: appointment.referenceCode,
      appointment: {
        referenceCode: appointment.referenceCode,
        customerName: appointment.customerName,
        startTime: appointment.startTime,
        endTime: appointment.endTime,
        durationMinutes: appointment.durationMinutes,
        totalPriceRupees: appointment.totalPriceRupees,
        status: appointment.status,
        holdExpiresAt: appointment.holdExpiresAt,
      },
    });
  } catch (error: unknown) {
    logError("booking.create", error, databaseErrorContext(error));
    const message = error instanceof Error ? error.message : "";
    const isSlotConflict = message.includes("SLOT_UNAVAILABLE") || message.includes("SLOT_BLOCKED");

    if (isSlotConflict) {
      return NextResponse.json(
        { success: false, error: stripInternalCode(message), code: "SLOT_CONFLICT" },
        { status: 409 }
      );
    }

    if (isUserFacing(error)) {
      return NextResponse.json(
        { success: false, error: message, code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }

    // Anything else is a database or infrastructure failure: log it server-side
    // and return a message that gives the customer a next step without leaking
    // implementation detail.
    return NextResponse.json(
      {
        success: false,
        error: "We could not save your request. Please try again in a moment, or contact the salon directly.",
        code: "SERVER_ERROR",
      },
      { status: 500 }
    );
  }
}
