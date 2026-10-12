import { NextRequest, NextResponse } from "next/server";
import { requireOwnerAuth } from "@/lib/auth";
import { getSalonHours } from "@/lib/booking-service";
import { getDb, initDb } from "@/lib/db";

export async function GET() {
  const isAuth = await requireOwnerAuth();
  if (!isAuth) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const hours = await getSalonHours();
  return NextResponse.json({ success: true, hours });
}

export async function PUT(request: NextRequest) {
  const isAuth = await requireOwnerAuth();
  if (!isAuth) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { dayOfWeek, isOpen, openTime, closeTime, breakStart, breakEnd } = body;

    const validTime = (value: unknown) => typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
    if (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6 || typeof isOpen !== "boolean" ||
        !validTime(openTime) || !validTime(closeTime) || (breakStart != null && !validTime(breakStart)) || (breakEnd != null && !validTime(breakEnd)) ||
        openTime >= closeTime || ((breakStart == null) !== (breakEnd == null)) || (breakStart != null && (breakStart >= breakEnd || breakStart < openTime || breakEnd > closeTime))) {
      return NextResponse.json({ success: false, error: "Invalid dayOfWeek (0-6)" }, { status: 400 });
    }

    await initDb();
    const db = getDb();

    await db.execute({
      sql: `UPDATE salon_hours 
            SET is_open = ?, open_time = ?, close_time = ?, break_start = ?, break_end = ? 
            WHERE day_of_week = ?`,
      args: [
        isOpen ? 1 : 0,
        openTime,
        closeTime,
        breakStart || null,
        breakEnd || null,
        dayOfWeek,
      ],
    });

    return NextResponse.json({ success: true, message: "Hours updated successfully" });
  } catch (error: unknown) {
    console.error("Update hours error:", error);
    return NextResponse.json({ success: false, error: "Failed to update salon hours" }, { status: 500 });
  }
}
