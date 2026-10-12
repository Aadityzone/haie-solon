import { createClient, type Client } from "@libsql/client";
import path from "node:path";
import { proposedCatalogue } from "@/config/service-catalogue";

// Ensure global database client singleton across HMR in Next.js development
declare global {
  var __salonDbClient: Client | undefined;
  var __salonDbInitialized: boolean | undefined;
  var __salonDbInitPromise: Promise<void> | undefined;
}

const dbPath = process.env.SALON_DB_PATH || path.join(process.cwd(), "salon.db");

export function getDb(): Client {
  if (!global.__salonDbClient) {
    const url = process.env.DATABASE_URL || `file:${dbPath}`;
    global.__salonDbClient = createClient({
      url,
      authToken: process.env.DATABASE_AUTH_TOKEN,
    });
  }
  return global.__salonDbClient;
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
  const activeRows = existing.rows.filter((row) => Number(row.is_active) === 1);

  // A brand-new install takes the whole catalogue enabled with the proposed
  // price. An install that already has a live menu only gains missing rows,
  // and only when that install has nothing bookable at all — otherwise an
  // owner who disabled a service on purpose would find it switched back on.
  const freshInstall = existing.rows.length === 0;
  const publishIntoExisting = activeRows.length === 0;

  const now = new Date().toISOString();
  for (const service of proposedCatalogue) {
    if (ids.has(service.id)) {
      // Fill in a price the owner has never set, without overwriting one they did.
      await db.execute({
        sql: `UPDATE services
                 SET price_rupees = ?, category_id = ?, category_name = ?, duration_minutes = ?, sort_order = ?
               WHERE id = ? AND price_rupees IS NULL`,
        args: [
          service.proposedPriceRupees,
          service.categoryId,
          service.categoryName,
          service.durationMinutes,
          service.sortOrder,
          service.id,
        ],
      });
      if (publishIntoExisting) {
        await db.execute({
          sql: "UPDATE services SET is_active = 1 WHERE id = ? AND is_active = 0 AND price_verified = 0",
          args: [service.id],
        });
      }
      continue;
    }

    await db.execute({
      sql: `INSERT INTO services (
              id, category_id, category_name, name, description, price_rupees,
              duration_minutes, is_active, sort_order, image_url, price_verified, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 0, ?)`,
      args: [
        service.id,
        service.categoryId,
        service.categoryName,
        service.name,
        service.description,
        service.proposedPriceRupees,
        service.durationMinutes,
        freshInstall || publishIntoExisting ? 1 : 0,
        service.sortOrder,
        now,
      ],
    });
  }
}
