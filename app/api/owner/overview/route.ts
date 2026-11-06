import { NextResponse } from "next/server";
import { requireOwnerAuth } from "@/lib/auth";
import { cleanupExpiredHolds } from "@/lib/booking-service";
import { getDb, initDb } from "@/lib/db";
import { istToUtcIso, utcIsoToIstParts } from "@/lib/time-utils";
import { logError } from "@/lib/logger";
import type { AppointmentStatus } from "@/lib/types";

const STATUSES: AppointmentStatus[] = ["PENDING", "CONFIRMED", "REJECTED", "CANCELLED", "COMPLETED"];

/** Built once at module scope; the previous form constructed one per day, per request. */
const WEEK_DAY_LABEL = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  weekday: "short",
  day: "numeric",
  month: "short",
});

/** Shift a `YYYY-MM-DD` string by whole days without timezone drift. */
function shiftDate(dateStr: string, days: number): string {
  const value = new Date(`${dateStr}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

/**
 * Operational summary for the owner dashboard.
 *
 * Every figure is a real aggregate over stored appointments. Expired pending
 * holds are released first so "pending" never includes a request that has
 * already lapsed, and nothing here is estimated or synthesised.
 */
export async function GET() {
  if (!(await requireOwnerAuth())) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    await initDb();
    await cleanupExpiredHolds();
    const db = getDb();
    const now = new Date();
    const nowIso = now.toISOString();
    const today = utcIsoToIstParts(nowIso).date;

    const [todayResult, pendingResult, upcomingResult, breakdownResult, revenueResult] = await Promise.all([
      db.execute({
        sql: "SELECT count(*) AS count FROM appointments WHERE start_time >= ? AND start_time < ? AND status IN ('PENDING','CONFIRMED','COMPLETED')",
        args: [istToUtcIso(today, "00:00"), istToUtcIso(shiftDate(today, 1), "00:00")],
      }),
      db.execute({
        sql: "SELECT count(*) AS count FROM appointments WHERE status = 'PENDING' AND hold_expires_at > ?",
        args: [nowIso],
      }),
      db.execute({
        sql: "SELECT count(*) AS count FROM appointments WHERE status = 'CONFIRMED' AND start_time >= ?",
        args: [nowIso],
      }),
      db.execute("SELECT status, count(*) AS count FROM appointments GROUP BY status"),
      db.execute("SELECT COALESCE(SUM(total_price_rupees), 0) AS total FROM appointments WHERE status = 'COMPLETED' AND total_price_rupees IS NOT NULL"),
    ]);

    const counts = Object.fromEntries(breakdownResult.rows.map((row) => [String(row.status), Number(row.count)]));
    const statusBreakdown = STATUSES.map((status) => ({ status, count: counts[status] ?? 0 }));

    // Per-day totals for the next seven days, including today.
    //
    // This was seven sequential `GROUP BY status` queries, one per day, each
    // awaited in turn — so the route's latency was the sum of seven round trips
    // on top of the parallel batch above. One indexed range scan answers the
    // whole week, bucketed by salon-local date in memory. Doing the bucketing
    // here also avoids leaning on SQLite's date parsing to turn a stored UTC
    // instant into an IST calendar day.
    const weekResult = await db.execute({
      sql: `SELECT start_time, status FROM appointments
            WHERE start_time >= ? AND start_time < ? AND status IN ('PENDING','CONFIRMED','COMPLETED')`,
      args: [istToUtcIso(today, "00:00"), istToUtcIso(shiftDate(today, 7), "00:00")],
    });

    const perDay = new Map<string, { total: number; pending: number }>();
    for (const row of weekResult.rows) {
      const date = utcIsoToIstParts(String(row.start_time)).date;
      const entry = perDay.get(date) ?? { total: 0, pending: 0 };
      entry.total += 1;
      if (String(row.status) === "PENDING") entry.pending += 1;
      perDay.set(date, entry);
    }

    const week = Array.from({ length: 7 }, (_, offset) => {
      const date = shiftDate(today, offset);
      const entry = perDay.get(date) ?? { total: 0, pending: 0 };
      return {
        date,
        label: offset === 0 ? "Today" : WEEK_DAY_LABEL.format(new Date(`${date}T06:00:00Z`)),
        total: entry.total,
        pending: entry.pending,
      };
    });

    return NextResponse.json({
      success: true,
      overview: {
        today,
        todayCount: Number(todayResult.rows[0]?.count ?? 0),
        pendingCount: Number(pendingResult.rows[0]?.count ?? 0),
        upcomingConfirmedCount: Number(upcomingResult.rows[0]?.count ?? 0),
        completedRevenueRupees: Number(revenueResult.rows[0]?.total ?? 0),
        statusBreakdown,
        week,
      },
    });
  } catch (error: unknown) {
    logError("owner.overview", error);
    return NextResponse.json({ success: false, error: "Could not load the dashboard summary." }, { status: 500 });
  }
}
