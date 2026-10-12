import crypto from "node:crypto";
import { cookies } from "next/headers";
import { getDb, initDb } from "./db";

const SESSION_COOKIE_NAME = "salon_owner_session";
const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60; // 7 days

// Secret used for signing session cookies
function getAuthSecret() {
  if (process.env.NODE_ENV === "production" && !process.env.AUTH_SECRET) throw new Error("AUTH_SECRET must be configured in production");
  return process.env.AUTH_SECRET || "local-development-only-change-before-deploy";
}

/**
 * Hash a password securely using scrypt with random salt
 */
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const derivedKey = crypto.scryptSync(password, salt, 64);
  return `${salt}:${derivedKey.toString("hex")}`;
}

/**
 * Verify password against stored salt:hash in constant time
 */
export function verifyPassword(password: string, storedHash: string): boolean {
  try {
    const [salt, key] = storedHash.split(":");
    if (!salt || !key) return false;
    const keyBuffer = Buffer.from(key, "hex");
    const derivedKey = crypto.scryptSync(password, salt, 64);
    return crypto.timingSafeEqual(keyBuffer, derivedKey);
  } catch {
    return false;
  }
}

/**
 * Creates an HMAC signed session token
 */
export function createSessionToken(userId: string): string {
  const expiresAt = Date.now() + SESSION_MAX_AGE_SECONDS * 1000;
  const payload = `${userId}:${expiresAt}`;
  const hmac = crypto.createHmac("sha256", getAuthSecret()).update(payload).digest("hex");
  return `${payload}:${hmac}`;
}

/**
 * Verifies and decodes a signed session token
 */
export function verifySessionToken(token: string): { valid: boolean; userId?: string } {
  try {
    const parts = token.split(":");
    if (parts.length !== 3) return { valid: false };
    const [userId, expiresAtStr, hmac] = parts;
    const expiresAt = Number(expiresAtStr);
    if (!userId || !Number.isSafeInteger(expiresAt) || !/^[a-f0-9]{64}$/i.test(hmac) || Date.now() > expiresAt) return { valid: false };

    const expectedHmac = crypto.createHmac("sha256", getAuthSecret()).update(`${userId}:${expiresAtStr}`).digest("hex");
    const validHmac = crypto.timingSafeEqual(Buffer.from(hmac, "hex"), Buffer.from(expectedHmac, "hex"));

    return { valid: validHmac, userId: validHmac ? userId : undefined };
  } catch {
    return { valid: false };
  }
}

/**
 * Checks if the owner account has been initialized
 */
export async function isOwnerAccountConfigured(): Promise<boolean> {
  await initDb();
  const db = getDb();

  if (process.env.OWNER_PASSWORD) return true;

  const result = await db.execute({
    sql: `SELECT value FROM owner_settings WHERE key = 'owner_password_hash'`,
    args: [],
  });

  return result.rows.length > 0;
}

/**
 * Sets up initial owner password if none is configured
 */
export async function setupOwnerPassword(password: string): Promise<boolean> {
  if (password.length < 8) {
    throw new Error("Password must be at least 8 characters long.");
  }

  await initDb();
  const db = getDb();
  const hash = hashPassword(password);
  const result = await db.execute({
    sql: `INSERT INTO owner_settings (key, value) SELECT 'owner_password_hash', ?
          WHERE NOT EXISTS (SELECT 1 FROM owner_settings WHERE key = 'owner_password_hash')`,
    args: [hash],
  });
  if (!result.rowsAffected) throw new Error("Owner account is already configured.");

  return true;
}

/**
 * Validates owner password against environment or database
 */
export async function authenticateOwner(password: string): Promise<boolean> {
  await initDb();
  const db = getDb();

  // 1. Check environment variable first
  if (process.env.OWNER_PASSWORD) {
    const actual = Buffer.from(password);
    const expected = Buffer.from(process.env.OWNER_PASSWORD);
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
  }

  // 2. Check database hash
  const result = await db.execute({
    sql: `SELECT value FROM owner_settings WHERE key = 'owner_password_hash'`,
    args: [],
  });

  if (result.rows.length === 0) {
    return false;
  }

  return verifyPassword(password, String(result.rows[0].value));
}

/**
 * Sets session cookie in Next.js response
 */
export async function setOwnerSessionCookie(): Promise<void> {
  const token = createSessionToken("owner");
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

/**
 * Clears session cookie
 */
export async function clearOwnerSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}

/**
 * Verifies current request is from an authenticated owner
 */
export async function requireOwnerAuth(): Promise<boolean> {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME);
  if (!sessionCookie?.value) return false;

  const verification = verifySessionToken(sessionCookie.value);
  return verification.valid;
}
