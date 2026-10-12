/**
 * Error types for the booking domain.
 *
 * `SalonError` marks a message that is written for the customer and safe to
 * return from an API route. Anything else that escapes a handler is treated as
 * internal: the route logs it and returns a generic message, so database errors,
 * connection failures, and stack details never reach a browser.
 */

export class SalonError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SalonError";
  }
}

/** True when the message may be shown to a customer verbatim. */
export function isUserFacing(error: unknown): error is SalonError {
  return error instanceof SalonError;
}

/** Strips the `SLOT_UNAVAILABLE:` style prefix used for route-level branching. */
export function stripInternalCode(message: string): string {
  return message.replace(/^[A-Z][A-Z_]*:\s*/, "");
}
