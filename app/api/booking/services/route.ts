import { NextResponse } from "next/server";
import { getActiveServices } from "@/lib/booking-service";

export async function GET() {
  try {
    const services = await getActiveServices();
    return NextResponse.json({ success: true, services });
  } catch (error: unknown) {
    console.error("Failed to fetch services:", error);
    return NextResponse.json(
      { success: false, error: "Failed to load services" },
      { status: 500 }
    );
  }
}
