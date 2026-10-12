import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getDb, initDb } from "@/lib/db";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
  if (searchParams.get("hub.mode") === "subscribe" && token && searchParams.get("hub.verify_token") === token) {
    return new Response(searchParams.get("hub.challenge") || "", { status: 200, headers: { "Content-Type": "text/plain" } });
  }
  return new Response("Forbidden", { status: 403 });
}

export async function POST(request: NextRequest) {
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (!appSecret) return NextResponse.json({ success: false }, { status: 503 });
  const rawBody = await request.text();
  const signature = request.headers.get("x-hub-signature-256") || "";
  const expected = `sha256=${crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex")}`;
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(actualBuffer, expectedBuffer)) {
    return NextResponse.json({ success: false }, { status: 401 });
  }

  try {
    const body = JSON.parse(rawBody) as { entry?: { changes?: { value?: { statuses?: { id?: string; status?: string; errors?: unknown[] }[] } }[] }[] };
    const updates = (body.entry || []).flatMap(entry => (entry.changes || []).flatMap(change => change.value?.statuses || []));
    await initDb();
    const db = getDb();
    for (const update of updates) {
      if (!update.id || !["sent", "delivered", "read", "failed"].includes(update.status || "")) continue;
      const status = update.status === "delivered" ? "DELIVERED" : update.status === "read" ? "READ" : update.status === "failed" ? "FAILED" : "ACCEPTED";
      const errorMessage = status === "FAILED" ? "WhatsApp reported message delivery failure." : null;
      await db.execute({
        sql: `UPDATE notification_logs SET status = ?, error_message = COALESCE(?, error_message), sent_at = CASE WHEN ? IN ('DELIVERED','READ') THEN ? ELSE sent_at END
              WHERE provider_message_id = ? AND status NOT IN ('DELIVERED','READ','FAILED')
              AND NOT (status = 'ACCEPTED' AND ? = 'ACCEPTED')`,
        args: [status, errorMessage, status, new Date().toISOString(), update.id, status],
      });
    }
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: false }, { status: 400 });
  }
}
