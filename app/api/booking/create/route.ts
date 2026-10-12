import { NextRequest, NextResponse } from "next/server";
import { createBookingRequest } from "@/lib/booking-service";
import { isUserFacing, stripInternalCode } from "@/lib/errors";
import { logError } from "@/lib/logger";

// Simple rate-limiting map: ip -> timestamps[]
const rateLimitMap = new Map<string, number[]>();
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const MAX_REQUESTS_PER_WINDOW = 8;

/**
 * The ceiling is raised only when the deployment explicitly sets
 * `BOOKING_RATE_LIMIT_MAX`, which the browser suite does for its own
 * single-process server so that one run's requests do not exhaust the budget.
 * Left unset — as in every real deployment — the limit above applies.
 */
function requestCeiling(): number {
  const configured = Number(process.env.BOOKING_RATE_LIMIT_MAX);
  return Number.isInteger(configured) && configured > 0 ? configured : MAX_REQUESTS_PER_WINDOW;
}

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const timestamps = rateLimitMap.get(ip) || [];
  const validTimestamps = timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);

  if (validTimestamps.length >= requestCeiling()) {
    rateLimitMap.set(ip, validTimestamps);
    return false;
  }

  validTimestamps.push(now);
  rateLimitMap.set(ip, validTimestamps);
  return true;
}

export async function POST(request: NextRequest) {
  try {
    const forwardedFor = request.headers.get("x-forwarded-for");
    const ip = forwardedFor ? forwardedFor.split(",")[0].trim() : "127.0.0.1";

    if (!checkRateLimit(ip)) {
      return NextResponse.json(
        {
          success: false,
          error: "Too many booking requests from your network. Please wait a few minutes before trying again.",
        },
        { status: 429 }
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
    logError("booking.create", error);
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
