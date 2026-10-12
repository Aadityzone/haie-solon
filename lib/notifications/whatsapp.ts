import { getDb } from "../db";
import crypto from "node:crypto";

export interface NotificationPayload {
  appointmentId: string;
  recipientPhone: string;
  recipientRole: "OWNER" | "CUSTOMER";
  eventType: "NEW_REQUEST" | "CONFIRMED" | "REJECTED" | "CANCELLED";
  customerOptedIn?: boolean;
  details: {
    referenceCode: string;
    customerName: string;
    customerPhone: string;
    servicesText: string;
    dateTimeText: string;
    totalPriceText: string;
    durationText: string;
    notes?: string;
    rejectionReason?: string;
  };
}

export type NotificationResult = {
  success: boolean;
  status: "ACCEPTED" | "FAILED" | "SKIPPED" | "DUPLICATE";
  logId: string;
  error?: string;
};

const templateFor = (event: NotificationPayload["eventType"]) =>
  process.env[`WHATSAPP_TEMPLATE_${event}`]?.trim();
const maskPhone = (phone: string) => `${phone.slice(0, 3)}***${phone.slice(-2)}`;

/** Sends approved template messages only. Cloud API acceptance is not delivery confirmation. */
export async function sendAppointmentNotification(payload: NotificationPayload): Promise<NotificationResult> {
  const db = getDb();
  const logId = crypto.randomUUID();
  const now = new Date().toISOString();
  const template = templateFor(payload.eventType);
  const isProduction = process.env.NODE_ENV === "production";
  const recipient = payload.recipientRole === "OWNER"
    ? (isProduction ? process.env.WHATSAPP_OWNER_RECIPIENT : process.env.WHATSAPP_DEV_RECIPIENT)
    : payload.recipientPhone;
  const canMessageCustomer = payload.recipientRole !== "CUSTOMER" || payload.customerOptedIn === true;
  const configured = Boolean(process.env.WHATSAPP_API_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID && process.env.WHATSAPP_API_VERSION);

  if (!canMessageCustomer) return logResult("SKIPPED", "Customer did not opt in to WhatsApp messages.");
  if (!configured || !recipient || !template) {
    return logResult("SKIPPED", "WhatsApp credentials, recipient, or approved message template are not configured.");
  }

  const phone = recipient.replace(/\D/g, "");
  if (!/^\d{10,15}$/.test(phone)) return logResult("FAILED", "Configured WhatsApp recipient is invalid.");
  const components = [{ type: "body", parameters: [
    payload.details.referenceCode, payload.details.customerName, payload.details.servicesText,
    payload.details.dateTimeText, payload.details.durationText, payload.details.totalPriceText,
    payload.details.rejectionReason || "",
  ].map((text) => ({ type: "text", text: String(text).slice(0, 500) })) }];

  try {
    await db.execute({
      sql: `INSERT INTO notification_logs (id, appointment_id, recipient, recipient_role, event_type, status, message_payload, created_at)
            VALUES (?, ?, ?, ?, ?, 'SENDING', ?, ?)`,
      args: [logId, payload.appointmentId, maskPhone(phone), payload.recipientRole, payload.eventType,
        JSON.stringify({ template, language: process.env.WHATSAPP_TEMPLATE_LANGUAGE || "en_US" }), now],
    });
  } catch {
    const previous = await db.execute({ sql: "SELECT id, status FROM notification_logs WHERE appointment_id = ? AND recipient_role = ? AND event_type = ?", args: [payload.appointmentId, payload.recipientRole, payload.eventType] });
    if (previous.rows.length) return { success: false, status: "DUPLICATE", logId: String(previous.rows[0].id) };
    return logResult("FAILED", "Could not record notification attempt.");
  }

  try {
    const version = process.env.WHATSAPP_API_VERSION!.replace(/^v/, "");
    let response: Response | undefined;
    for (let attempt = 0; attempt < 3; attempt++) {
      response = await fetch(`https://graph.facebook.com/v${version}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.WHATSAPP_API_TOKEN}`, "Content-Type": "application/json" },
        body: JSON.stringify({ messaging_product: "whatsapp", to: phone, type: "template", template: {
          name: template, language: { code: process.env.WHATSAPP_TEMPLATE_LANGUAGE || "en_US" }, components,
        } }),
        signal: AbortSignal.timeout(10000),
      });
      if (response.ok || (response.status !== 429 && response.status < 500) || attempt === 2) break;
      const retryAfter = Number(response.headers.get("retry-after"));
      await new Promise((resolve) => setTimeout(resolve, Math.min(5000, retryAfter > 0 ? retryAfter * 1000 : 500 * (attempt + 1))));
    }
    if (!response?.ok) {
      const httpStatus = response?.status || 0;
      await db.execute({ sql: "UPDATE notification_logs SET status = 'FAILED', error_message = ?, message_payload = ? WHERE id = ?",
        args: [`WhatsApp API returned HTTP ${httpStatus}`, JSON.stringify({ template }), logId] });
      return { success: false, status: "FAILED", logId, error: `WhatsApp API returned HTTP ${httpStatus}` };
    }
    let providerMessageId: string | null = null;
    try {
      const responseBody = await response.json() as { messages?: { id?: string }[] };
      providerMessageId = typeof responseBody.messages?.[0]?.id === "string" ? responseBody.messages[0].id : null;
    } catch { /* API acceptance can still be recorded without its callback ID. */ }
    // API response means accepted for processing; a delivery webhook is needed for SENT/DELIVERED state.
    await db.execute({ sql: "UPDATE notification_logs SET status = 'ACCEPTED', provider_message_id = ?, message_payload = ? WHERE id = ?",
      args: [providerMessageId, JSON.stringify({ template }), logId] });
    return { success: true, status: "ACCEPTED", logId };
  } catch {
    await db.execute({ sql: "UPDATE notification_logs SET status = 'FAILED', error_message = ? WHERE id = ?", args: ["WhatsApp request failed; retry may be needed.", logId] });
    return { success: false, status: "FAILED", logId, error: "WhatsApp request failed; retry may be needed." };
  }

  async function logResult(status: "FAILED" | "SKIPPED", error: string): Promise<NotificationResult> {
    try {
      await db.execute({ sql: `INSERT INTO notification_logs (id, appointment_id, recipient, recipient_role, event_type, status, message_payload, error_message, created_at)
        VALUES (?, ?, 'masked', ?, ?, ?, '{}', ?, ?)`,
        args: [logId, payload.appointmentId, payload.recipientRole, payload.eventType, status, error, now] });
      return { success: status === "SKIPPED", status, logId, error };
    } catch {
      const previous = await db.execute({ sql: "SELECT id FROM notification_logs WHERE appointment_id = ? AND recipient_role = ? AND event_type = ?", args: [payload.appointmentId, payload.recipientRole, payload.eventType] });
      return { success: false, status: "DUPLICATE", logId: previous.rows[0] ? String(previous.rows[0].id) : logId };
    }
  }
}

