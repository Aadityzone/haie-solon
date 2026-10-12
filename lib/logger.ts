/**
 * Minimal structured logger for server routes.
 *
 * Two rules it exists to enforce:
 *
 *  1. Server errors are logged as one structured line, not a raw object dump.
 *  2. Customer contact data never reaches the log. Phone numbers are redacted
 *     from any message before it is written, and `context` values are expected
 *     to carry identifiers only — never a name, phone, or booking reference.
 *
 * Booking references are deliberately excluded from logs: a reference is the
 * customer's capability token for the status lookup.
 */

/** Indian mobile numbers in the shapes customers actually type. */
const CONTACT_PATTERN = /(?:\+?91[\s-]?|0)?[6-9](?:[\s-]?\d){9}/g;

function redact(message: string): string {
  return message.replace(CONTACT_PATTERN, "[redacted-contact]");
}

function serializeContext(context?: Record<string, unknown>): Record<string, unknown> {
  if (!context) return {};
  const safe: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(context)) {
    if (value === undefined) continue;
    safe[key] = typeof value === "string" ? redact(value) : value;
  }
  return safe;
}

export function logError(scope: string, error: unknown, context?: Record<string, unknown>): void {
  const message = error instanceof Error ? error.message : String(error);
  console.error(
    JSON.stringify({
      level: "error",
      scope,
      message: redact(message),
      ...serializeContext(context),
    }),
  );
}

export function logWarn(scope: string, message: string, context?: Record<string, unknown>): void {
  console.warn(JSON.stringify({ level: "warn", scope, message: redact(message), ...serializeContext(context) }));
}
