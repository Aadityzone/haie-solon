import { NextRequest, NextResponse } from "next/server";
import { requireOwnerAuth } from "@/lib/auth";
import { getDb, initDb } from "@/lib/db";
import { isUserFacing, SalonError } from "@/lib/errors";
import { logError } from "@/lib/logger";
import crypto from "node:crypto";

export async function GET() {
  const isAuth = await requireOwnerAuth();
  if (!isAuth) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  await initDb();
  const db = getDb();

  const result = await db.execute(
    `SELECT id, start_time, end_time, reason, created_at 
     FROM blocked_periods 
     ORDER BY start_time ASC;`
  );

  return NextResponse.json({
    success: true,
    blockedPeriods: result.rows.map((r) => ({
      id: String(r.id),
      startTime: String(r.start_time),
      endTime: String(r.end_time),
      reason: String(r.reason),
      createdAt: String(r.created_at),
    })),
  });
}

export async function POST(request: NextRequest) {
  const isAuth = await requireOwnerAuth();
  if (!isAuth) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { startTime, endTime, reason } = body;

    const hasZone = (value: unknown) => typeof value === "string" && /T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value);
    if (!hasZone(startTime) || !hasZone(endTime) || typeof reason !== "string" || !reason.trim() || reason.length > 120 || Number.isNaN(Date.parse(startTime)) || Number.isNaN(Date.parse(endTime))) {
      return NextResponse.json(
        { success: false, error: "startTime, endTime, and reason are required" },
        { status: 400 }
      );
    }

    const startIso = new Date(startTime).toISOString();
    const endIso = new Date(endTime).toISOString();
    if (startIso >= endIso) {
      return NextResponse.json(
        { success: false, error: "startTime must be before endTime" },
        { status: 400 }
      );
    }

    await initDb();
    const db = getDb();
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    const tx = await db.transaction("write");
    try {
      const conflict = await tx.execute({ sql: `SELECT reference_code FROM appointments WHERE (status = 'CONFIRMED' OR (status = 'PENDING' AND hold_expires_at > ?)) AND NOT (end_time <= ? OR start_time >= ?) LIMIT 1`, args: [now, startIso, endIso] });
      if (conflict.rows.length) throw new SalonError(`This period overlaps appointment ${String(conflict.rows[0].reference_code)}.`);
      await tx.execute({
      sql: `INSERT INTO blocked_periods (id, start_time, end_time, reason, created_at)
            VALUES (?, ?, ?, ?, ?)`,
      args: [id, startIso, endIso, reason.trim(), now],
      });
      await tx.commit();
    } catch (error) { await tx.rollback(); throw error; }

    return NextResponse.json({
      success: true,
      blockedPeriod: { id, startTime: startIso, endTime: endIso, reason: reason.trim(), createdAt: now },
    });
  } catch (error: unknown) {
    logError("owner.blockedPeriods", error);
    if (isUserFacing(error)) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }
    return NextResponse.json({ success: false, error: "Could not block that time. Please try again." }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const isAuth = await requireOwnerAuth();
  if (!isAuth) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ success: false, error: "Blocked period ID is required" }, { status: 400 });
    }

    await initDb();
    const db = getDb();
    await db.execute({
      sql: `DELETE FROM blocked_periods WHERE id = ?`,
      args: [id],
    });

    return NextResponse.json({ success: true, message: "Blocked period removed" });
  } catch (error: unknown) {
    console.error("Delete blocked period error:", error);
    return NextResponse.json({ success: false, error: "Failed to remove blocked period" }, { status: 500 });
  }
}
