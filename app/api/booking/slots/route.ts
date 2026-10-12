import { NextRequest, NextResponse } from "next/server";
import { getAvailableSlots } from "@/lib/booking-service";
import { isUserFacing } from "@/lib/errors";
import { logError } from "@/lib/logger";

export async function GET(request: NextRequest) {
  try {
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
    logError("booking.slots", error);
    if (isUserFacing(error)) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }
    return NextResponse.json({ success: false, error: "Could not check availability. Please try again." }, { status: 500 });
  }
}
