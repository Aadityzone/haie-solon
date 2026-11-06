import { NextRequest, NextResponse } from "next/server";
import { getAppointmentByReference } from "@/lib/booking-service";
import { databaseErrorContext } from "@/lib/db";
import { normalizeIndianPhone, utcIsoToIstParts } from "@/lib/time-utils";
import { logError } from "@/lib/logger";
import { rateLimit, clientIp, rateLimitHeaders, RATE_LIMITS } from "@/lib/rate-limit";

/**
 * Customer booking lookup.
 *
 * Requires the booking reference AND the mobile number the booking was made
 * with. The reference is high-entropy, but requiring the phone as well means a
 * leaked or guessed reference is not sufficient on its own, and the response
 * never distinguishes "unknown reference" from "wrong number".
 */
export async function GET(request: NextRequest) {
  try {
    const limit = await rateLimit("booking-status", clientIp(request), RATE_LIMITS.status.limit, RATE_LIMITS.status.windowMs);
    if (!limit.allowed) {
      return NextResponse.json(
        { success: false, error: "Too many status lookups. Try again later." },
        { status: 429, headers: rateLimitHeaders(limit) }
      );
    }

    const { searchParams } = new URL(request.url);
    const ref = searchParams.get("ref")?.trim();
    const phone = searchParams.get("phone")?.trim();

    if (!ref) {
      return NextResponse.json({ success: false, error: "Appointment reference code is required" }, { status: 400 });
    }
    if (!phone) {
      return NextResponse.json({ success: false, error: "The mobile number used for the booking is required" }, { status: 400 });
    }

    const phoneValidation = normalizeIndianPhone(phone);
    if (!phoneValidation.valid) {
      return NextResponse.json({ success: false, error: phoneValidation.error }, { status: 400 });
    }

    const appt = await getAppointmentByReference(ref, phoneValidation.normalized);
    if (!appt) {
      return NextResponse.json(
        { success: false, error: "No appointment matches that reference and mobile number." },
        { status: 404 }
      );
    }

    const istParts = utcIsoToIstParts(appt.startTime);

    return NextResponse.json({
      success: true,
      appointment: {
        referenceCode: appt.referenceCode,
        customerName: appt.customerName,
        status: appt.status,
        date: istParts.displayDate,
        time: istParts.displayTime,
        durationMinutes: appt.durationMinutes,
        totalPriceRupees: appt.totalPriceRupees,
        services: appt.services?.map((s) => ({
          name: s.serviceName,
          priceRupees: s.priceRupees,
          durationMinutes: s.durationMinutes,
        })),
        rejectionReason: appt.rejectionReason,
        holdExpiresAt: appt.holdExpiresAt,
      },
    });
  } catch (error: unknown) {
    logError("booking.status", error, databaseErrorContext(error));
    return NextResponse.json(
      { success: false, error: "Could not look up that booking right now. Please try again." },
      { status: 500 }
    );
  }
}
