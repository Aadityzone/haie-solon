import { NextRequest, NextResponse } from "next/server";
import { requireOwnerAuth } from "@/lib/auth";
import { getDb, initDb } from "@/lib/db";

const defaults = { pendingHoldMinutes: 30, maxAdvanceBookingDays: 30, slotIntervalMinutes: 15, bufferMinutes: 0 };
const keys = { pendingHoldMinutes: "pending_hold_minutes", maxAdvanceBookingDays: "max_advance_booking_days", slotIntervalMinutes: "slot_interval_minutes", bufferMinutes: "salon_buffer_minutes" } as const;

export async function GET() {
  if (!(await requireOwnerAuth())) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  await initDb();
  const result = await getDb().execute("SELECT key, value FROM owner_settings WHERE key IN ('pending_hold_minutes','max_advance_booking_days','slot_interval_minutes','salon_buffer_minutes')");
  const values = Object.fromEntries(result.rows.map(row => [String(row.key), Number(row.value)]));
  return NextResponse.json({ success: true, settings: {
    pendingHoldMinutes: values[keys.pendingHoldMinutes] ?? defaults.pendingHoldMinutes,
    maxAdvanceBookingDays: values[keys.maxAdvanceBookingDays] ?? defaults.maxAdvanceBookingDays,
    slotIntervalMinutes: values[keys.slotIntervalMinutes] ?? defaults.slotIntervalMinutes,
    bufferMinutes: values[keys.bufferMinutes] ?? defaults.bufferMinutes,
  } });
}

export async function PUT(request: NextRequest) {
  if (!(await requireOwnerAuth())) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  try {
    const body = await request.json();
    const valid = Number.isInteger(body.pendingHoldMinutes) && body.pendingHoldMinutes >= 5 && body.pendingHoldMinutes <= 1440 &&
      Number.isInteger(body.maxAdvanceBookingDays) && body.maxAdvanceBookingDays >= 1 && body.maxAdvanceBookingDays <= 365 &&
      [5, 10, 15, 20, 30, 60].includes(body.slotIntervalMinutes) && Number.isInteger(body.bufferMinutes) && body.bufferMinutes >= 0 && body.bufferMinutes <= 120;
    if (!valid) return NextResponse.json({ success: false, error: "Check reservation hold (5–1440 min), booking window (1–365 days), slot interval, and buffer (0–120 min)." }, { status: 400 });
    await initDb();
    const db = getDb();
    const tx = await db.transaction("write");
    try {
      for (const key of Object.keys(keys) as (keyof typeof keys)[]) {
        await tx.execute({ sql: "INSERT INTO owner_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", args: [keys[key], String(body[key])] });
      }
      await tx.commit();
    } catch (error) { await tx.rollback(); throw error; }
    return NextResponse.json({ success: true, settings: body });
  } catch {
    return NextResponse.json({ success: false, error: "Could not save booking settings." }, { status: 400 });
  }
}
