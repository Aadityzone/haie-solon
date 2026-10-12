import { NextRequest, NextResponse } from "next/server";
import { getActiveServices, getBookingRules } from "@/lib/booking-service";
import { databaseErrorContext } from "@/lib/db";
import { isUserFacing } from "@/lib/errors";
import { logError } from "@/lib/logger";

/** The longest a single request may be, matching the booking engine's own limit. */
const MAX_TOTAL_DURATION = 480;

/**
 * Everything the booking page needs to render its first step truthfully:
 *
 * - `services` — the owner-enabled catalogue, with the database's own price and
 *   duration. The customer never sees a price the owner has not published, and
 *   the UI never keeps a second copy of either number.
 * - `rules` — the salon's bookable window and the per-day reason it is open or
 *   closed, derived on the server from settings, opening hours, and blocked
 *   periods.
 *
 * Two optional parameters tighten the window without ever widening it:
 *
 * - `duration` — the combined length of the chosen services, in minutes.
 * - `services` — a comma-separated list of service ids. When present, the
 *   duration is recalculated from the database rather than trusted from the
 *   query string, so the earliest selectable date cannot be influenced by a
 *   crafted request.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const servicesParam = (searchParams.get("services") || "").trim();
    const durationParam = searchParams.get("duration");

    const serviceIds = servicesParam
      ? Array.from(new Set(servicesParam.split(",").map((value) => value.trim()).filter(Boolean)))
      : [];

    if (serviceIds.length > 8 || serviceIds.some((id) => id.length > 64)) {
      return NextResponse.json({ success: false, error: "Too many services requested." }, { status: 400 });
    }

    const services = await getActiveServices();

    let duration = 0;
    if (serviceIds.length > 0) {
      const selected = services.filter((service) => serviceIds.includes(service.id));
      if (selected.length !== serviceIds.length) {
        return NextResponse.json(
          { success: false, error: "One or more of those services is no longer available." },
          { status: 400 }
        );
      }
      duration = selected.reduce((sum, service) => sum + service.durationMinutes, 0);
      if (duration === 0 || duration > MAX_TOTAL_DURATION) {
        return NextResponse.json({ success: false, error: "That combination of services is too long." }, { status: 400 });
      }
    } else if (durationParam !== null && durationParam !== "") {
      if (!/^\d{1,3}$/.test(durationParam)) {
        return NextResponse.json({ success: false, error: "Duration must be a whole number of minutes." }, { status: 400 });
      }
      duration = Number(durationParam);
      if (duration < 5 || duration > MAX_TOTAL_DURATION) {
        return NextResponse.json({ success: false, error: "Duration must be between 5 and 480 minutes." }, { status: 400 });
      }
    }

    const rules = await getBookingRules(duration);
    return NextResponse.json({ success: true, services, rules });
  } catch (error: unknown) {
    logError("booking.config", error, databaseErrorContext(error));
    if (isUserFacing(error)) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }
    return NextResponse.json(
      { success: false, error: "Could not load the booking menu. Please try again." },
      { status: 500 }
    );
  }
}
