import { logWarn } from "./logger";

/**
 * A small, bounded, in-process TTL cache with tag invalidation and
 * single-flight de-duplication.
 *
 * Why this exists: the salon's booking rules, opening hours, and service
 * catalogue change only when the owner edits them, yet they were read from the
 * database on every single request — several times per request in some paths.
 * At a hundred thousand visits that is hundreds of thousands of identical
 * queries against data that did not change.
 *
 * Why not `unstable_cache`: that stores results in Next's incremental cache,
 * which persists under `<distDir>/cache` across server restarts and deploys.
 * For this application that is a liability — a database that has been reset or
 * restored would keep being shadowed by a cached snapshot from the previous
 * process, and nothing in the app could clear it. An in-process cache is
 * discarded the moment the process is, which makes it impossible to serve data
 * that a restart would have contradicted.
 *
 * Consequences, stated plainly:
 *
 * - The cache is per instance. A fleet of N instances holds N copies, and a
 *   mutation invalidates only the instance that handled it; every other
 *   instance serves its copy until the TTL lapses. The TTLs here are therefore
 *   deliberately short, and every mutation still invalidates its own process
 *   immediately so the common single-instance deployment is exact.
 * - Nothing here is durable. A cold start begins with an empty cache and reads
 *   through once.
 */

interface CacheEntry {
  value: unknown;
  /** Epoch milliseconds after which this entry must not be served. */
  expiresAt: number;
  tags: string[];
}

/** Hard ceiling on entries, so an attacker cannot grow this without bound. */
const MAX_ENTRIES = 500;

const entries = new Map<string, CacheEntry>();

/**
 * Loads currently in progress, keyed the same way as `entries`.
 *
 * This is the stampede guard. Without it, a cold cache under a burst of
 * concurrent traffic would send every one of those requests to the database for
 * the same row — the exact thundering-herd the cache is meant to prevent.
 */
const inFlight = new Map<string, Promise<unknown>>();

let lastSweep = 0;
const SWEEP_INTERVAL_MS = 60_000;

/** Drops expired entries, and if still over the ceiling, the oldest ones. */
function sweep(now: number): void {
  for (const [key, entry] of entries) {
    if (entry.expiresAt <= now) entries.delete(key);
  }
  while (entries.size > MAX_ENTRIES) {
    const oldest = entries.keys().next();
    if (oldest.done) break;
    entries.delete(oldest.value);
  }
}

/**
 * Returns the cached value for `key`, or runs `load` and caches its result.
 *
 * Concurrent callers for the same cold key share one `load` call rather than
 * racing; the shared promise is removed as soon as it settles, so a rejected
 * load is never cached and the next caller retries.
 */
export async function cached<T>(
  key: string,
  tags: string[],
  ttlMs: number,
  load: () => Promise<T>,
): Promise<T> {
  const now = Date.now();

  const hit = entries.get(key);
  if (hit && hit.expiresAt > now) {
    // Re-insert so Map iteration order approximates least-recently-used.
    entries.delete(key);
    entries.set(key, hit);
    return hit.value as T;
  }

  const pending = inFlight.get(key);
  if (pending) return pending as Promise<T>;

  const promise = load()
    .then((value) => {
      entries.set(key, { value, expiresAt: Date.now() + ttlMs, tags });
      if (Date.now() - lastSweep > SWEEP_INTERVAL_MS) {
        lastSweep = Date.now();
        sweep(Date.now());
      }
      return value;
    })
    .finally(() => {
      if (inFlight.get(key) === promise) inFlight.delete(key);
    });

  inFlight.set(key, promise);
  return promise;
}

/**
 * Drops every entry carrying any of `tags`.
 *
 * Called by the owner mutation routes so a saved service, a changed opening
 * hour, or an edited booking rule is visible to the next request rather than
 * after the TTL.
 */
export function invalidateTags(tags: string[]): void {
  if (tags.length === 0) return;
  const wanted = new Set(tags);
  for (const [key, entry] of entries) {
    if (entry.tags.some((tag) => wanted.has(tag))) entries.delete(key);
  }
}

/** Empties the cache. Exposed for tests that change data behind the app's back. */
export function clearServerCache(): void {
  entries.clear();
  inFlight.clear();
  lastSweep = 0;
}

/**
 * Runs `invalidateTags` without ever letting a cache miss-fix break a mutation.
 *
 * A stale cache is a delay; a thrown error from a mutation that already
 * committed its write is a lie to the operator, so failures here are logged and
 * swallowed.
 */
export function invalidateTagsSafely(scope: string, tags: string[]): void {
  try {
    invalidateTags(tags);
  } catch (error: unknown) {
    logWarn(scope, "Cache invalidation failed; entries will expire on their own TTL.", {
      cacheError: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * The cache tags this application invalidates.
 *
 * `catalogue` covers the service menu; `config` covers everything that shapes
 * the bookable window — opening hours, breaks, and the booking rules.
 */
export const CACHE_TAGS = {
  catalogue: "salon-catalogue",
  config: "salon-config",
} as const;

/**
 * How long each cached value may be served.
 *
 * Short on purpose: these are per-instance caches, so the TTL is also the
 * worst-case delay before a *different* instance notices an owner's edit. A
 * minute of staleness on a price list is invisible to a customer and reduces
 * the read volume by orders of magnitude.
 */
export const CACHE_TTL_MS = {
  catalogue: 60_000,
  config: 60_000,
} as const;
