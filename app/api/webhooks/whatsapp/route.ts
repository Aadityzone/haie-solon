import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getDb, initDb } from "@/lib/db";
import { logError } from "@/lib/logger";

/**
 * Meta echoes the verification token during webhook subscription.
 *
 * Compared in constant time, matching how the POST signature below is checked.
 * The token is a shared secret, and a byte-by-byte comparison leaks its length
 * and prefix to a caller who can time the response.
 */
function tokensMatch(candidate: string, expected: string): boolean {
  const a = Buffer.from(candidate);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
  const candidate = searchParams.get("hub.verify_token") ?? "";
  if (searchParams.get("hub.mode") === "subscribe" && token && tokensMatch(candidate, token)) {
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

    // One batched write for the whole callback instead of one awaited statement
    // per status entry.
    //
    // Meta delivers many statuses in a single POST, and each one was previously
    // its own round trip taken while the request was still open. Because Meta
    // re-delivers a callback the endpoint did not acknowledge in time, a slow
    // serial loop could amplify itself: the batch times out, Meta sends it
    // again, and the same writes are attempted a second time. Duplicates are
    // already harmless here (every statement is idempotent against an
    // already-final status), but collapsing them removes the amplification.
    const sentAt = new Date().toISOString();
    const statements = updates
      .filter((update) => update.id && ["sent", "delivered", "read", "failed"].includes(update.status || ""))
      .map((update) => {
        const status = update.status === "delivered" ? "DELIVERED" : update.status === "read" ? "READ" : update.status === "failed" ? "FAILED" : "ACCEPTED";
        const errorMessage = status === "FAILED" ? "WhatsApp reported message delivery failure." : null;
        return {
          sql: `UPDATE notification_logs SET status = ?, error_message = COALESCE(?, error_message), sent_at = CASE WHEN ? IN ('DELIVERED','READ') THEN ? ELSE sent_at END
                WHERE provider_message_id = ? AND status NOT IN ('DELIVERED','READ','FAILED')
                AND NOT (status = 'ACCEPTED' AND ? = 'ACCEPTED')`,
          args: [status, errorMessage, status, sentAt, update.id as string, status],
        };
      });

    if (statements.length > 0) await db.batch(statements, "write");

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    // Logged rather than swallowed: a database outage during a webhook burst
    // used to be completely invisible.
    logError("webhooks.whatsapp", error);
    return NextResponse.json({ success: false }, { status: 400 });
  }
}
