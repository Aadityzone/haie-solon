import { NextRequest, NextResponse } from "next/server";
import { getAvailableSlots } from "@/lib/booking-service";
import { databaseErrorContext } from "@/lib/db";
import { isUserFacing } from "@/lib/errors";
import { logError } from "@/lib/logger";
import { rateLimit, clientIp, rateLimitHeaders, RATE_LIMITS } from "@/lib/rate-limit";

export async function GET(request: NextRequest) {
  try {
    // The most-requested public endpoint, and previously the only one with no
    // limit at all.
    const limit = await rateLimit("booking-slots", clientIp(request), RATE_LIMITS.slots.limit, RATE_LIMITS.slots.windowMs);
    if (!limit.allowed) {
      return NextResponse.json(
        { success: false, error: "Too many availability requests. Please wait a moment and try again." },
        { status: 429, headers: rateLimitHeaders(limit) }
      );
    }

    const { searchParams } = new URL(request.url);
    const date = searchParams.get("date");
    const durationParam = searchParams.get("duration");

    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json(
        { success: false, error: "Valid date parameter (YYYY-MM-DD) is required" },
        { status: 400 }
      );
    }

    const duration = durationParam && /^\d+$/.test(durationParam) ? Number(durationParam) : durationParam ? Number.NaN : 30;
    if (isNaN(duration) || duration < 10 || duration > 480) {
      return NextResponse.json(
        { success: false, error: "Duration must be between 10 and 480 minutes" },
        { status: 400 }
      );
    }

    const data = await getAvailableSlots(date, duration);
    return NextResponse.json({ success: true, ...data });
  } catch (error: unknown) {
    logError("booking.slots", error, databaseErrorContext(error));
    if (isUserFacing(error)) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }
    return NextResponse.json({ success: false, error: "Could not check availability. Please try again." }, { status: 500 });
  }
}
