import { NextResponse } from "next/server";
import { getActiveServices } from "@/lib/booking-service";
import { databaseErrorContext } from "@/lib/db";
import { logError } from "@/lib/logger";

/**
 * The customer-facing service catalogue.
 *
 * A failure here is almost always the database rather than a query, so it is
 * recorded with the connection context (which variable supplied the URL, hosted
 * or local, the host, and the libSQL/SQLite error) and answered with a message
 * that carries no implementation detail.
 */
export async function GET() {
  try {
    const services = await getActiveServices();
    return NextResponse.json({ success: true, services });
  } catch (error: unknown) {
    logError("booking.services", error, databaseErrorContext(error));
    return NextResponse.json(
      { success: false, error: "Failed to load services" },
      { status: 500 }
    );
  }
}
