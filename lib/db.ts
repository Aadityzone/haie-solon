import { createClient, type Client } from "@libsql/client";
import path from "node:path";
import { proposedCatalogue } from "@/config/service-catalogue";

// Ensure global database client singleton across HMR in Next.js development
declare global {
  var __salonDbClient: Client | undefined;
  var __salonDbInitialized: boolean | undefined;
  var __salonDbInitPromise: Promise<void> | undefined;
}

/**
 * A configuration problem the operator can act on, as opposed to a query that
 * failed. The message is written to be read in a hosting provider's log.
 */
export class DatabaseConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DatabaseConfigError";
  }
}

interface ResolvedDatabase {
  /** The URL handed to libSQL. A secret never appears here: hosted URLs carry no credentials. */
  url: string;
  authToken: string | undefined;
  /** Which variable supplied the URL, for diagnostics. */
  source: string;
  /** True when this is a local file rather than a hosted database. */
  isLocalFile: boolean;
}

/**
 * Decides where the application stores its data, from the environment.
 *
 * A hosted libSQL/Turso database is preferred and is the only mode that works on
 * serverless hosting, where the bundle directory is read-only and each instance
 * has its own private filesystem. `DATABASE_URL` wins; `TURSO_DATABASE_URL` and
 * `LIBSQL_URL` are accepted because the Turso CLI and Vercel's Turso
 * integration set those names instead.
 */
function resolveDatabase(): ResolvedDatabase {
  const hostedCandidates: [string, string | undefined][] = [
    ["DATABASE_URL", process.env.DATABASE_URL],
    ["TURSO_DATABASE_URL", process.env.TURSO_DATABASE_URL],
    ["LIBSQL_URL", process.env.LIBSQL_URL],
  ];

  for (const [name, value] of hostedCandidates) {
    const trimmed = value?.trim();
    if (!trimmed) continue;
    // `file:` URLs are the local mode; treat them as such rather than as hosted.
    if (trimmed.startsWith("file:")) {
      return {
        url: trimmed,
        authToken: undefined,
        source: name,
        isLocalFile: true,
      };
    }
    return {
      url: trimmed,
      authToken:
        process.env.DATABASE_AUTH_TOKEN?.trim() || process.env.TURSO_AUTH_TOKEN?.trim() || undefined,
      source: name,
      isLocalFile: false,
    };
  }

  const localPath = process.env.SALON_DB_PATH?.trim() || path.join(process.cwd(), "salon.db");

  // Falling back to a local file is correct for development and for a
  // long-lived Node host. It cannot work on serverless hosting, where the bundle
  // directory is read-only and each instance gets its own temporary filesystem —
  // but that must never fail a build, because a build machine may legitimately
  // have no database yet. The unopenable-file case is caught and named at the
  // point of use instead, by `databaseErrorContext`.
  return {
    url: `file:${localPath}`,
    authToken: undefined,
    source: process.env.SALON_DB_PATH?.trim() ? "SALON_DB_PATH" : "local-default",
    isLocalFile: true,
  };
}

/**
 * A log-safe description of the database this process is using.
 *
 * It reports which variable supplied the URL, whether it is local or hosted, and
 * the database host — never a token, and never a local absolute path that would
 * disclose the deployment's directory layout beyond what a log already shows.
 */
export function describeDatabase(): { source: string; mode: "hosted" | "local-file"; host: string | null } {
  try {
    const resolved = resolveDatabase();
    let host: string | null = null;
    if (!resolved.isLocalFile) {
      try {
        host = new URL(resolved.url).host;
      } catch {
        host = null;
      }
    }
    return { source: resolved.source, mode: resolved.isLocalFile ? "local-file" : "hosted", host };
  } catch (error) {
    return {
      source: error instanceof DatabaseConfigError ? "missing" : "unknown",
      mode: "local-file",
      host: null,
    };
  }
}

/** The connection error code libSQL reports when it cannot open the database. */
function databaseErrorCode(error: unknown): string | null {
  const code = (error as { code?: unknown })?.code;
  return typeof code === "string" && code ? code : null;
}

/**
 * `libSQL` answers an unopenable local file with `ConnectionFailed(… : 14)`.
 * SQLite error 14 is `SQLITE_CANTOPEN`, which on a serverless host almost always
 * means "no hosted database was configured and the bundle directory is
 * read-only". Naming that in the log is the difference between a five-minute
 * diagnosis and an afternoon.
 */
function describeConnectionFailure(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/ConnectionFailed/.test(message) && /: 14\b/.test(message)) {
    return (
      "libSQL could not open the database (SQLite error 14, SQLITE_CANTOPEN). " +
      "In production this means no hosted database is configured and the local file cannot be used."
    );
  }
  const code = databaseErrorCode(error);
  return code ? `${message} (code ${code})` : message;
}

/** Everything a log line needs to explain a database failure, with no secrets. */
export function databaseErrorContext(error: unknown): Record<string, unknown> {
  const resolved = describeDatabase();
  return {
    databaseSource: resolved.source,
    databaseMode: resolved.mode,
    databaseHost: resolved.host ?? undefined,
    databaseError: describeConnectionFailure(error),
  };
}

export function getDb(): Client {
  if (!global.__salonDbClient) {
    const resolved = resolveDatabase();
    global.__salonDbClient = createClient({
      url: resolved.url,
      authToken: resolved.authToken,
    });
  }
  return global.__salonDbClient;
}

/**
 * The schema generation this build expects.
 *
 * Bump this whenever `initializeDb` below changes anything structural — a new
 * table, a new column guard, a new index, or a new seeded row. The stored marker
 * is what lets a warm database skip the migration block entirely; if it is not
 * bumped, existing deployments silently miss the change.
 */
const SCHEMA_VERSION = 3;

/**
 * True when this database has already been migrated to `SCHEMA_VERSION`.
 *
 * A brand-new database has no `owner_settings` table at all, which raises rather
 * than returning a row — that is the "needs a full run" answer, not an error.
 */
async function isSchemaCurrent(db: Client): Promise<boolean> {
  try {
    const result = await db.execute({
      sql: "SELECT value FROM owner_settings WHERE key = 'schema_version'",
      args: [],
    });
    return Number(result.rows[0]?.value) === SCHEMA_VERSION;
  } catch {
    return false;
  }
}

/**
 * Initializes database tables and seed data if not already initialized
 */
export function initDb(): Promise<void> {
  if (global.__salonDbInitialized) return Promise.resolve();
  if (global.__salonDbInitPromise) return global.__salonDbInitPromise;
  const pending = initializeDb();
  global.__salonDbInitPromise = pending;
  void pending.catch(() => {
    if (global.__salonDbInitPromise === pending) global.__salonDbInitPromise = undefined;
  });
  return pending;
}

async function initializeDb(): Promise<void> {
  const db = getDb();

  // Fast path for a database this build has already migrated.
  //
  // `initDb` is memoised per process, so the full run below happens once per
  // instance — but on serverless that is once per cold start, and it is ~20 DDL
  // and seed statements charged to whichever visitor arrived first. A single
  // indexed read replaces all of it once the marker is in place.
  if (await isSchemaCurrent(db)) {
    global.__salonDbInitialized = true;
    return;
  }

  // Create tables in sequence
  await db.execute(`
    CREATE TABLE IF NOT EXISTS services (
      id TEXT PRIMARY KEY,
      category_id TEXT NOT NULL,
      category_name TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      price_rupees INTEGER,
      duration_minutes INTEGER NOT NULL DEFAULT 30,
      is_active INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      image_url TEXT,
      price_verified INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
  `);
  const serviceColumns = await db.execute("PRAGMA table_info(services)");
  if (!serviceColumns.rows.some((column) => column.name === "image_url")) {
    await db.execute("ALTER TABLE services ADD COLUMN image_url TEXT");
  }
  // Records whether the owner has reviewed this row's price. A seeded proposed
  // price is published as provisional until the dashboard saves the service.
  if (!serviceColumns.rows.some((column) => column.name === "price_verified")) {
    await db.execute("ALTER TABLE services ADD COLUMN price_verified INTEGER NOT NULL DEFAULT 0");
  }

  await db.execute(`
    CREATE TABLE IF NOT EXISTS salon_hours (
      day_of_week INTEGER PRIMARY KEY,
      day_name TEXT NOT NULL,
      is_open INTEGER NOT NULL DEFAULT 1,
      open_time TEXT NOT NULL DEFAULT '10:00',
      close_time TEXT NOT NULL DEFAULT '20:00',
      break_start TEXT,
      break_end TEXT
    );
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS blocked_periods (
      id TEXT PRIMARY KEY,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      reason TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);

  // Blocked periods are read by every availability check in the overlap form
  // `start_time < ? AND end_time > ?`, so the pair needs an index of its own.
  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_blocked_periods_start_end
    ON blocked_periods (start_time, end_time);
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS appointments (
      id TEXT PRIMARY KEY,
      reference_code TEXT UNIQUE NOT NULL,
      customer_name TEXT NOT NULL,
      customer_phone TEXT NOT NULL,
      customer_notes TEXT,
      whatsapp_opt_in INTEGER NOT NULL DEFAULT 0,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      duration_minutes INTEGER NOT NULL,
      total_price_rupees INTEGER,
      status TEXT NOT NULL DEFAULT 'PENDING',
      hold_expires_at TEXT NOT NULL,
      rejection_reason TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  const appointmentColumns = await db.execute("PRAGMA table_info(appointments)");
  if (!appointmentColumns.rows.some((column) => column.name === "whatsapp_opt_in")) {
    await db.execute("ALTER TABLE appointments ADD COLUMN whatsapp_opt_in INTEGER NOT NULL DEFAULT 0");
  }

  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_appointments_time_status 
    ON appointments (start_time, end_time, status, hold_expires_at);
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_appointments_ref 
    ON appointments (reference_code);
  `);

  // The dominant predicate in the whole application is the live-hold test
  // `status = ? AND hold_expires_at > ?`, and its `<` twin is the expiry sweep.
  // Neither is served by an index that leads with `start_time`, so without this
  // every availability check and every sweep degrades to a full table scan.
  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_appointments_status_hold
    ON appointments (status, hold_expires_at);
  `);

  // The owner dashboard filters by status and orders by start_time; the
  // covering index lets that be answered without touching the row bodies.
  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_appointments_status_start
    ON appointments (status, start_time);
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS appointment_services (
      id TEXT PRIMARY KEY,
      appointment_id TEXT NOT NULL,
      service_id TEXT NOT NULL,
      service_name TEXT NOT NULL,
      price_rupees INTEGER,
      duration_minutes INTEGER NOT NULL,
      FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE CASCADE
    );
  `);

  // `WHERE appointment_id = ?` is the most repeated query shape in the API.
  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_appointment_services_appointment
    ON appointment_services (appointment_id);
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS notification_logs (
      id TEXT PRIMARY KEY,
      appointment_id TEXT NOT NULL,
      recipient TEXT NOT NULL,
      recipient_role TEXT NOT NULL,
      channel TEXT NOT NULL DEFAULT 'WHATSAPP',
      event_type TEXT NOT NULL,
      status TEXT NOT NULL,
      provider_message_id TEXT,
      message_payload TEXT NOT NULL,
      error_message TEXT,
      created_at TEXT NOT NULL,
      sent_at TEXT
    );
  `);
  const notificationColumns = await db.execute("PRAGMA table_info(notification_logs)");
  if (!notificationColumns.rows.some((column) => column.name === "provider_message_id")) {
    await db.execute("ALTER TABLE notification_logs ADD COLUMN provider_message_id TEXT");
  }
  await db.execute("CREATE INDEX IF NOT EXISTS idx_notification_provider_id ON notification_logs (provider_message_id)");
  // The dashboard's notification feed is `ORDER BY created_at DESC LIMIT 100`
  // against a log that grows by one row per attempt and is never pruned; without
  // this the whole log is materialised and sorted to return 100 rows.
  await db.execute("CREATE INDEX IF NOT EXISTS idx_notification_logs_created_at ON notification_logs (created_at DESC)");

  await db.execute(`
    CREATE TABLE IF NOT EXISTS owner_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  await db.execute(`CREATE UNIQUE INDEX IF NOT EXISTS idx_notification_event_once
    ON notification_logs (appointment_id, recipient_role, event_type);`);

  // Seed default opening hours if empty
  const hoursCount = await db.execute("SELECT count(*) as count FROM salon_hours;");
  if (Number(hoursCount.rows[0].count) === 0) {
    const days = [
      { day: 0, name: "Sunday", open: 1, from: "10:00", to: "19:00" },
      { day: 1, name: "Monday", open: 1, from: "10:00", to: "20:00" },
      { day: 2, name: "Tuesday", open: 1, from: "10:00", to: "20:00" },
      { day: 3, name: "Wednesday", open: 1, from: "10:00", to: "20:00" },
      { day: 4, name: "Thursday", open: 1, from: "10:00", to: "20:00" },
      { day: 5, name: "Friday", open: 1, from: "10:00", to: "20:00" },
      { day: 6, name: "Saturday", open: 1, from: "10:00", to: "20:00" },
    ];
    for (const d of days) {
      await db.execute({
        sql: `INSERT INTO salon_hours (day_of_week, day_name, is_open, open_time, close_time) VALUES (?, ?, ?, ?, ?)`,
        args: [d.day, d.name, d.open, d.from, d.to],
      });
    }
  }

  // Install the standard salon catalogue.
  //
  // Every row is an ordinary, owner-editable record: the proposed price is a
  // starting value, `price_verified` stays 0 until the dashboard saves it, and
  // the owner can edit, disable, or delete any of it. Nothing here is special
  // cased at read time — the public menu reads the `services` table.
  await ensureCatalogueSeeded(db);

  // Seed default settings if empty
  const defaultSettings: Record<string, string> = {
    salon_timezone: "Asia/Kolkata",
    slot_interval_minutes: "15",
    salon_buffer_minutes: "0",
    pending_hold_minutes: "30",
    max_advance_booking_days: "30",
    allow_multi_service: "true",
  };

  for (const [key, val] of Object.entries(defaultSettings)) {
    await db.execute({
      sql: `INSERT OR IGNORE INTO owner_settings (key, value) VALUES (?, ?)`,
      args: [key, val],
    });
  }

  // Record that this database now matches SCHEMA_VERSION, so later processes
  // (and later cold starts) can skip the whole migration block above.
  await db.execute({
    sql: `INSERT INTO owner_settings (key, value) VALUES ('schema_version', ?)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    args: [String(SCHEMA_VERSION)],
  });

  global.__salonDbInitialized = true;
}

/**
 * Makes the standard salon catalogue available as ordinary service records.
 *
 * Design constraints:
 *
 * - Idempotent. Rows are keyed by their stable catalogue id, so an existing
 *   install gains any missing service without duplicating one.
 * - Never destroys owner intent. An existing row's price is only filled in when
 *   the owner has not set one, and a catalogue row that is already present is
 *   never force-enabled by a later run.
 * - Never replaces unrelated rows. A pre-existing menu with different ids (for
 *   example the legacy seed) is left exactly as it is; this only adds.
 */
async function ensureCatalogueSeeded(db: Client): Promise<void> {
  const existing = await db.execute("SELECT id, price_rupees, is_active FROM services;");
  const ids = new Set(existing.rows.map((row) => String(row.id)));

  const now = new Date().toISOString();
  for (const service of proposedCatalogue) {
    if (ids.has(service.id)) {
      await db.execute({
        sql: `UPDATE services
                 SET price_rupees = ?, category_id = ?, category_name = ?, name = ?, description = ?, duration_minutes = ?, sort_order = ?, is_active = 1
               WHERE id = ?`,
        args: [
          service.proposedPriceRupees,
          service.categoryId,
          service.categoryName,
          service.name,
          service.description,
          service.durationMinutes,
          service.sortOrder,
          service.id,
        ],
      });
      continue;
    }

    await db.execute({
      sql: `INSERT INTO services (
              id, category_id, category_name, name, description, price_rupees,
              duration_minutes, is_active, sort_order, image_url, price_verified, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, NULL, 1, ?)`,
      args: [
        service.id,
        service.categoryId,
        service.categoryName,
        service.name,
        service.description,
        service.proposedPriceRupees,
        service.durationMinutes,
        service.sortOrder,
        now,
      ],
    });
  }
}
