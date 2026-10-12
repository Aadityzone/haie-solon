import { NextResponse } from "next/server";
import { requireOwnerAuth } from "@/lib/auth";
import { getDb, initDb } from "@/lib/db";

/**
 * Reports the recorded WhatsApp notification attempts and the configuration
 * state of the integration.
 *
 * It deliberately reports only whether each credential is present, never its
 * value, and it never upgrades an attempt to "delivered": the recorded state is
 * whatever the Cloud API and the signed webhook actually reported.
 */

const EVENT_TEMPLATE_KEYS = [
  "WHATSAPP_TEMPLATE_NEW_REQUEST",
  "WHATSAPP_TEMPLATE_CONFIRMED",
  "WHATSAPP_TEMPLATE_REJECTED",
  "WHATSAPP_TEMPLATE_CANCELLED",
] as const;

function configuredState() {
  const present = (key: string) => Boolean(process.env[key]?.trim());
  const isProduction = process.env.NODE_ENV === "production";
  const recipientKey = isProduction ? "WHATSAPP_OWNER_RECIPIENT" : "WHATSAPP_DEV_RECIPIENT";

  const checks: { key: string; label: string; present: boolean }[] = [
    { key: "WHATSAPP_API_TOKEN", label: "Cloud API access token", present: present("WHATSAPP_API_TOKEN") },
    { key: "WHATSAPP_PHONE_NUMBER_ID", label: "Phone number ID", present: present("WHATSAPP_PHONE_NUMBER_ID") },
    { key: "WHATSAPP_API_VERSION", label: "API version", present: present("WHATSAPP_API_VERSION") },
    { key: recipientKey, label: isProduction ? "Owner recipient (production)" : "Development recipient", present: present(recipientKey) },
    ...EVENT_TEMPLATE_KEYS.map((key) => ({
      key,
      label: `Approved template ${key.replace("WHATSAPP_TEMPLATE_", "").toLowerCase().replace("_", " ")}`,
      present: present(key),
    })),
  ];

  return {
    environment: isProduction ? "production" : "development",
    recipientKey,
    ready: checks.every((check) => check.present),
    checks,
  };
}

export async function GET() {
  if (!(await requireOwnerAuth())) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    await initDb();
    const db = getDb();

    const result = await db.execute(`
      SELECT n.id, n.appointment_id, n.recipient, n.recipient_role, n.channel, n.event_type,
             n.status, n.error_message, n.created_at, n.sent_at, a.reference_code
      FROM notification_logs n
      LEFT JOIN appointments a ON a.id = n.appointment_id
      ORDER BY n.created_at DESC
      LIMIT 100;
    `);

    return NextResponse.json({
      success: true,
      configuration: configuredState(),
      notifications: result.rows.map((row) => ({
        id: String(row.id),
        appointmentId: String(row.appointment_id),
        referenceCode: row.reference_code ? String(row.reference_code) : null,
        recipient: String(row.recipient),
        recipientRole: String(row.recipient_role),
        channel: String(row.channel),
        eventType: String(row.event_type),
        status: String(row.status),
        errorMessage: row.error_message ? String(row.error_message) : null,
        createdAt: String(row.created_at),
        sentAt: row.sent_at ? String(row.sent_at) : null,
      })),
    });
  } catch (error: unknown) {
    console.error("Notification log error:", error);
    return NextResponse.json({ success: false, error: "Could not read the notification log." }, { status: 500 });
  }
}
