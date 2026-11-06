import { logWarn } from "./logger";

/**
 * Rate limiting for the public and authentication endpoints.
 *
 * Three properties this module exists to guarantee, all of which the previous
 * inline `Map`s of timestamps did not:
 *
 * 1. **Bounded memory.** Each route kept its own `Map<ip, number[]>` whose keys
 *    were never removed. Every distinct client address — including every
 *    address an attacker cared to invent — added a permanent entry, so the
 *    limiter was itself an unbounded memory-growth primitive. This store has a
 *    hard key ceiling and sweeps expired windows.
 *
 * 2. **A trustworthy client identity.** The old code keyed on the *first*
 *    `x-forwarded-for` entry, which is the one value in that header a client
 *    fully controls; sending a fresh random value per request yielded an
 *    infinite budget. The identity is now read from the hop that the nearest
 *    trusted proxy actually observed.
 *
 * 3. **A shared budget when one is configured.** An in-process counter is
 *    per-instance, so a fleet's real limit is `limit × instances`, and a cold
 *    start resets it. Setting `UPSTASH_REDIS_REST_URL` and
 *    `UPSTASH_REDIS_REST_TOKEN` moves the counter to a shared store; without
 *    them the in-process store is used, which is exact for a single instance.
 */

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  /** Whole seconds the caller should wait before retrying. */
  retryAfterSeconds: number;
}

interface Window {
  count: number;
  /** Epoch milliseconds at which this window is replaced. */
  resetAt: number;
}

/** Hard ceiling on tracked identities in the in-process store. */
const MAX_KEYS = 10_000;

const windows = new Map<string, Window>();

let lastSweep = 0;
const SWEEP_INTERVAL_MS = 30_000;

function sweep(now: number): void {
  for (const [key, window] of windows) {
    if (window.resetAt <= now) windows.delete(key);
  }
  // Still over the ceiling after dropping expired windows: evict the oldest,
  // which discards the least recently touched identities rather than growing.
  while (windows.size > MAX_KEYS) {
    const oldest = windows.keys().next();
    if (oldest.done) break;
    windows.delete(oldest.value);
  }
}

function consumeInMemory(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();

  if (now - lastSweep > SWEEP_INTERVAL_MS || windows.size > MAX_KEYS) {
    lastSweep = now;
    sweep(now);
  }

  const existing = windows.get(key);
  const window = existing && existing.resetAt > now ? existing : { count: 0, resetAt: now + windowMs };

  window.count += 1;
  // Re-insert so iteration order approximates least-recently-used.
  windows.delete(key);
  windows.set(key, window);

  const retryAfterSeconds = Math.max(1, Math.ceil((window.resetAt - now) / 1000));
  return {
    allowed: window.count <= limit,
    limit,
    remaining: Math.max(0, limit - window.count),
    retryAfterSeconds,
  };
}

/** The shared store's endpoint and token, or `null` when none is configured. */
function sharedStore(): { baseUrl: string; token: string } | null {
  const baseUrl = process.env.UPSTASH_REDIS_REST_URL?.trim().replace(/\/$/, "");
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  return baseUrl && token ? { baseUrl, token } : null;
}

/**
 * Builds the counter key. The window length is part of it so two callers with
 * different windows on the same bucket never share a counter.
 */
function rateLimitKey(bucket: string, identity: string, windowMs: number): string {
  const windowSeconds = Math.max(1, Math.ceil(windowMs / 1000));
  return `ratelimit:${bucket}:${windowSeconds}:${identity}`;
}

/**
 * Fixed-window counter in a shared Upstash-compatible Redis over its REST API.
 *
 * Returns `null` on any failure so the caller can fall back to the in-process
 * store. A rate limiter is a safety net, not a dependency: an unreachable Redis
 * must never take bookings down with it.
 */
async function consumeShared(
  key: string,
  limit: number,
  windowMs: number,
): Promise<RateLimitResult | null> {
  const store = sharedStore();
  if (!store) return null;

  try {
    const response = await fetch(`${store.baseUrl}/pipeline`, {
      method: "POST",
      headers: { Authorization: `Bearer ${store.token}`, "Content-Type": "application/json" },
      body: JSON.stringify([
        ["INCR", key],
        ["PEXPIRE", key, String(windowMs), "NX"],
        ["PTTL", key],
      ]),
      signal: AbortSignal.timeout(2000),
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const results = (await response.json()) as { result?: unknown }[];
    const count = Number(results[0]?.result);
    const ttl = Number(results[2]?.result);
    if (!Number.isFinite(count) || count <= 0) throw new Error("Unexpected counter value");

    const retryAfterSeconds = Number.isFinite(ttl) && ttl > 0 ? Math.ceil(ttl / 1000) : Math.ceil(windowMs / 1000);
    return {
      allowed: count <= limit,
      limit,
      remaining: Math.max(0, limit - count),
      retryAfterSeconds: Math.max(1, retryAfterSeconds),
    };
  } catch (error: unknown) {
    logWarn("rate-limit.shared", "Shared rate-limit store unavailable; falling back to the in-process counter.", {
      rateLimitError: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Charges one request against `bucket` for `identity`.
 *
 * `bucket` names the endpoint family so that a caller who exhausts the booking
 * budget does not also lock themselves out of, say, the status lookup.
 */
export async function rateLimit(
  bucket: string,
  identity: string,
  limit: number,
  windowMs: number,
): Promise<RateLimitResult> {
  const key = rateLimitKey(bucket, identity, windowMs);

  const shared = await consumeShared(key, limit, windowMs);
  if (shared) return shared;

  return consumeInMemory(key, limit, windowMs);
}

/**
 * Clears the counter for one identity.
 *
 * The sign-in route calls this on success, so an owner who mistypes a password a
 * few times and then succeeds does not stay one attempt away from a lockout for
 * the rest of the window. It has to be preserved exactly: the browser suite
 * signs in many times from one address in a single run, and without this it
 * would lock itself out partway through.
 */
export async function resetRateLimit(bucket: string, identity: string, windowMs: number): Promise<void> {
  const key = rateLimitKey(bucket, identity, windowMs);
  windows.delete(key);

  const store = sharedStore();
  if (!store) return;
  try {
    await fetch(`${store.baseUrl}/pipeline`, {
      method: "POST",
      headers: { Authorization: `Bearer ${store.token}`, "Content-Type": "application/json" },
      body: JSON.stringify([["DEL", key]]),
      signal: AbortSignal.timeout(2000),
      cache: "no-store",
    });
  } catch (error: unknown) {
    // A counter that outlives a successful sign-in is a nuisance, not a fault;
    // it decays with the window regardless.
    logWarn("rate-limit.reset", "Could not clear the shared sign-in counter.", {
      rateLimitError: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * The client address to rate limit on.
 *
 * `x-forwarded-for` is a comma-separated chain, oldest hop first. The entries a
 * client can forge are the ones it supplies itself, which the proxy prepends
 * *before* its own observation — so the trustworthy entry is counted from the
 * right, not the left as the previous implementation assumed.
 *
 * `TRUSTED_PROXY_HOPS` is the number of proxies in front of this app that
 * append to that header (default 1: a single edge or load balancer). Set it to
 * 0 when the app is exposed directly, in which case the header is ignored
 * entirely and every caller shares one bucket — noisy, but never spoofable.
 */
export function clientIp(request: Request): string {
  const rawHops = Number(process.env.TRUSTED_PROXY_HOPS);
  const hops = Number.isInteger(rawHops) && rawHops >= 0 && rawHops <= 10 ? rawHops : 1;

  if (hops === 0) {
    // No trusted proxy: nothing in the request can be believed about identity.
    return "direct";
  }

  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const chain = forwarded.split(",").map((part) => part.trim()).filter(Boolean);
    if (chain.length > 0) {
      const index = Math.max(0, chain.length - hops);
      const candidate = chain[index];
      if (candidate) return candidate.slice(0, 64);
    }
  }

  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp.slice(0, 64);

  // No usable address. Every such caller shares a bucket, which is the safe
  // direction to fail: one noisy caller can be throttled, an attacker cannot
  // mint fresh identities.
  return "unknown";
}

/**
 * The `Retry-After` and diagnostic headers for a rejected request.
 *
 * Only `Retry-After` is standard; the other two follow the widely understood
 * `RateLimit-*` draft so a client can back off correctly.
 */
export function rateLimitHeaders(result: RateLimitResult): Record<string, string> {
  return {
    "Retry-After": String(result.retryAfterSeconds),
    "RateLimit-Limit": String(result.limit),
    "RateLimit-Remaining": String(result.remaining),
    "RateLimit-Reset": String(result.retryAfterSeconds),
  };
}

/** Empties the in-process store. Exposed for tests. */
export function resetRateLimits(): void {
  windows.clear();
  lastSweep = 0;
}

/** Per-endpoint budgets, in one place so they can be reviewed together. */
export const RATE_LIMITS = {
  /**
   * Availability polling.
   *
   * Deliberately loose. Mobile carriers put many subscribers behind one address
   * through CGNAT, and this endpoint serves the booking wizard, which refetches
   * as a customer explores dates — a tight budget here would lock out real
   * people before it inconvenienced an attacker. The database cost of abuse is
   * already bounded by the read cache, so this limit exists to protect request
   * CPU rather than the database.
   */
  slots: { limit: 300, windowMs: 10 * 60 * 1000 },
  /** Booking configuration: read-only and cached, so bounded generously too. */
  config: { limit: 300, windowMs: 10 * 60 * 1000 },
  /** Writes an appointment request. */
  create: { limit: 8, windowMs: 10 * 60 * 1000 },
  /** Status lookup, which requires a reference and a phone number. */
  status: { limit: 20, windowMs: 10 * 60 * 1000 },
  /** Password attempts. */
  login: { limit: 10, windowMs: 15 * 60 * 1000 },
} as const;
