/**
 * A repeatable load benchmark for the salon booking service.
 *
 * It measures the three request shapes that carry this application's traffic —
 * the public service menu, a booking-configuration read, and an availability
 * check — by counting the database statements each one actually issues, and by
 * timing them under concurrency.
 *
 * Statement counts are the primary metric on purpose. They are deterministic,
 * they do not depend on the machine running the benchmark, and they are the
 * thing that changes an application from "comfortable at a hundred thousand
 * visits" to "a write lock per page view". Wall-clock numbers are reported
 * alongside them, but they vary with the host and with how fast the local
 * SQLite file happens to be warm.
 *
 * Usage:
 *
 *   node tests/load/benchmark.cjs                       # measure this checkout
 *   SALON_BENCH_ROOT=/path/to/tree node tests/load/benchmark.cjs
 *   SALON_BENCH_LABEL=before node tests/load/benchmark.cjs
 *
 * `SALON_BENCH_ROOT` exists so the same script can be pointed at a pristine
 * checkout of an older revision, which is how the before/after figures in
 * `PERFORMANCE.md` were produced: both trees are measured by identical code.
 */

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const Module = require("node:module");

const root = path.resolve(process.env.SALON_BENCH_ROOT || path.join(__dirname, "..", ".."));
const label = process.env.SALON_BENCH_LABEL || "current";

const APPOINTMENT_COUNT = Number(process.env.SALON_BENCH_APPOINTMENTS || 4000);
const ITERATIONS = Number(process.env.SALON_BENCH_ITERATIONS || 200);
const CONCURRENCY = Number(process.env.SALON_BENCH_CONCURRENCY || 100);

// ---------------------------------------------------------------------------
// Module loading: the app is TypeScript, so transpile on require exactly as the
// unit test harness does.
// ---------------------------------------------------------------------------

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "salon-bench-"));
process.env.SALON_DB_PATH = path.join(temp, "bench.db");
delete process.env.DATABASE_URL;
delete process.env.TURSO_DATABASE_URL;
delete process.env.LIBSQL_URL;
process.env.NODE_ENV = "test";

const project = root;
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  const mapped = request.startsWith("@/") ? path.join(project, request.slice(2)) : request;
  return originalResolve.call(this, mapped, parent, isMain, options);
};
const ts = require(path.join(project, "node_modules", "typescript"));
require.extensions[".ts"] = (module, filename) => {
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  module._compile(output, filename);
};

const service = require(path.join(project, "lib", "booking-service.ts"));
const time = require(path.join(project, "lib", "time-utils.ts"));
const { getDb } = require(path.join(project, "lib", "db.ts"));

/**
 * The read cache only exists on the optimised revision. Where it is absent the
 * "cold" measurement is skipped rather than faked, because the older revision
 * has no cache to clear — every one of its requests is already a cold one.
 */
let clearServerCache = null;
try {
  clearServerCache = require(path.join(project, "lib", "server-cache.ts")).clearServerCache;
} catch {
  clearServerCache = null;
}

// ---------------------------------------------------------------------------
// Instrumentation: count statements, and the wall-clock spent inside them.
// ---------------------------------------------------------------------------

const stats = { total: 0, reads: 0, writes: 0, transactions: 0, dbMs: 0 };
let counting = false;

function classify(sql) {
  // Must match the keys on `stats`.
  return /^\s*(select|with)\b/i.test(sql) ? "reads" : "writes";
}

function record(statements, started) {
  if (!counting) return;
  for (const statement of statements) {
    const sql = typeof statement === "string" ? statement : statement?.sql ?? "";
    stats.total += 1;
    stats[classify(sql)] += 1;
  }
  if (started) stats.dbMs += Number(process.hrtime.bigint() - started) / 1e6;
}

/**
 * Replaces the shared client with a counting proxy.
 *
 * The client's methods are not reliably writable, so they are intercepted by
 * swapping `global.__salonDbClient` — which is what `getDb()` returns — for a
 * Proxy. Every subsequent `getDb()` call anywhere in the application therefore
 * hands back the instrumented client, including from `lib/db.ts`'s own internals.
 */
function instrument() {
  if (global.__benchInstrumented) return;
  const real = getDb();
  global.__benchInstrumented = true;

  const wrapTransaction = (tx) => {
    if (!tx || tx.__benchWrapped) return tx;
    tx.__benchWrapped = true;
    const originalExecute = tx.execute;
    const originalBatch = tx.batch;
    tx.execute = async (statement) => {
      const started = counting ? process.hrtime.bigint() : 0n;
      try {
        return await originalExecute.call(tx, statement);
      } finally {
        record([statement], started);
      }
    };
    tx.batch = async (statements) => {
      const list = Array.isArray(statements) ? statements : [];
      const started = counting ? process.hrtime.bigint() : 0n;
      try {
        return await originalBatch.call(tx, statements);
      } finally {
        record(list, started);
      }
    };
    return tx;
  };

  const proxy = new Proxy(real, {
    get(target, property, receiver) {
      if (property === "execute") {
        return async (statement) => {
          const started = counting ? process.hrtime.bigint() : 0n;
          try {
            return await target.execute(statement);
          } finally {
            record([statement], started);
          }
        };
      }
      if (property === "batch") {
        return async (statements, mode) => {
          const list = Array.isArray(statements) ? statements : [];
          const started = counting ? process.hrtime.bigint() : 0n;
          try {
            return await target.batch(statements, mode);
          } finally {
            record(list, started);
          }
        };
      }
      if (property === "transaction") {
        return async (mode) => {
          if (counting) stats.transactions += 1;
          const tx = await target.transaction(mode);
          return wrapTransaction(tx);
        };
      }
      const value = Reflect.get(target, property, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });

  global.__salonDbClient = proxy;
}

function reset(live) {
  stats.total = 0;
  stats.reads = 0;
  stats.writes = 0;
  stats.transactions = 0;
  stats.dbMs = 0;
  counting = live;
}

// ---------------------------------------------------------------------------
// Seeding: a database with enough rows that a missing index actually shows up.
// ---------------------------------------------------------------------------

function addDays(dateStr, days) {
  const value = new Date(`${dateStr}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

async function seed() {
  const db = getDb();
  // Touch every read path once so initDb creates the schema and the catalogue.
  const services = await service.getActiveServices();
  if (services.length === 0) throw new Error("The seeded catalogue is empty; cannot benchmark.");

  const today = time.utcIsoToIstParts(new Date().toISOString()).date;
  const nowIso = new Date().toISOString();
  const pastIso = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const futureIso = new Date(Date.now() + 30 * 60 * 1000).toISOString();

  const appointmentRows = [];
  const serviceRows = [];
  const statuses = ["CONFIRMED", "PENDING", "COMPLETED", "CANCELLED", "REJECTED"];

  for (let i = 0; i < APPOINTMENT_COUNT; i += 1) {
    // Spread across the bookable window, weighted so the measured day is busy.
    const dayOffset = i % 30;
    const date = addDays(today, dayOffset);
    const minuteOfDay = 10 * 60 + (i % 36) * 15;
    const hour = String(Math.floor(minuteOfDay / 60)).padStart(2, "0");
    const minute = String(minuteOfDay % 60).padStart(2, "0");
    const status = statuses[i % statuses.length];
    const id = `bench-${i}`;
    const start = time.istToUtcIso(date, `${hour}:${minute}`);
    const end = time.istToUtcIso(date, `${String(Math.floor((minuteOfDay + 30) / 60)).padStart(2, "0")}:${String((minuteOfDay + 30) % 60).padStart(2, "0")}`);

    appointmentRows.push({
      sql: `INSERT INTO appointments (id, reference_code, customer_name, customer_phone, customer_notes, whatsapp_opt_in,
              start_time, end_time, duration_minutes, total_price_rupees, status, hold_expires_at, rejection_reason, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, 0, ?, ?, 30, ?, ?, ?, NULL, ?, ?)`,
      args: [
        id, `BK-BENCH${String(i).padStart(3, "0")}`, `Bench Customer ${i}`, "+919999999999", null,
        start, end, 500, status,
        status === "PENDING" ? futureIso : pastIso,
        nowIso, nowIso,
      ],
    });

    serviceRows.push({
      sql: `INSERT INTO appointment_services (id, appointment_id, service_id, service_name, price_rupees, duration_minutes)
            VALUES (?, ?, ?, ?, ?, ?)`,
      args: [`bench-svc-${i}`, id, services[0].id, services[0].name, 500, 30],
    });
  }

  await db.batch(appointmentRows, "write");
  await db.batch(serviceRows, "write");

  // A handful of blocked periods, so the availability check has to consult them.
  const blockRows = [];
  for (let i = 0; i < 20; i += 1) {
    const date = addDays(today, i);
    blockRows.push({
      sql: `INSERT INTO blocked_periods (id, start_time, end_time, reason, created_at) VALUES (?, ?, ?, ?, ?)`,
      args: [`bench-block-${i}`, time.istToUtcIso(date, "14:00"), time.istToUtcIso(date, "15:00"), "Bench block", nowIso],
    });
  }
  await db.batch(blockRows, "write");

  return { today, targetDate: addDays(today, 1), services };
}

// ---------------------------------------------------------------------------
// Scenarios.
// ---------------------------------------------------------------------------

/**
 * What the public menu needs in order to render: the owner-enabled catalogue,
 * and whether any price has been reviewed.
 *
 * Each revision is measured doing the work *that revision* requires for the same
 * user-visible page. The older one computed the entire bookable window —
 * settings, opening hours, and blocked periods — in order to read one boolean
 * out of it, and began that work with a write. The current one reads the
 * catalogue and derives the flag from the rows it already has.
 */
const derivesFlagFromCatalogue = typeof service.isAnyPriceVerified === "function";

async function scenarioMenu() {
  const services = await service.getActiveServices();
  if (!derivesFlagFromCatalogue) await service.getBookingRules();
  return services.length;
}

async function scenarioConfig() {
  const services = await service.getActiveServices();
  await service.getBookingRules(60);
  return services.length;
}

async function scenarioSlots(ctx) {
  const result = await service.getAvailableSlots(ctx.targetDate, 30);
  return result.slots.length;
}

/**
 * Measures one scenario.
 *
 * `cold` clears the read cache before every operation, which reports what a
 * request costs when it has to go to the database. It is the honest comparison
 * point against a revision that has no cache at all: the older code was
 * unconditionally cold, every request, forever.
 *
 * The warm figures are the steady state at volume, where the cache is warm for
 * all but a handful of requests in any given minute.
 */
async function measure(name, fn, ctx, cold) {
  const prepare = async () => {
    if (cold && clearServerCache) clearServerCache();
    return fn(ctx);
  };

  // Warm-up: initialise the database, prime any internal cache, let the JIT settle.
  for (let i = 0; i < 5; i += 1) await prepare();

  reset(true);
  const started = process.hrtime.bigint();
  for (let i = 0; i < ITERATIONS; i += 1) await prepare();
  const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;
  // Snapshot before clearing: `reset` zeroes the counters.
  const captured = { ...stats };
  reset(false);

  return {
    name,
    // A revision with no read cache has exactly one regime, and calling it
    // "warm" would flatter it: every one of its requests is a cold one.
    mode: clearServerCache ? (cold ? "cold (cache cleared per op)" : "warm (steady state)") : "no cache in this revision",
    statementsPerOp: captured.total / ITERATIONS,
    readsPerOp: captured.reads / ITERATIONS,
    writesPerOp: captured.writes / ITERATIONS,
    msPerOp: elapsedMs / ITERATIONS,
    dbMsPerOp: captured.dbMs / ITERATIONS,
  };
}

async function measureAll(name, fn, ctx) {
  const results = [await measure(name, fn, ctx, false)];
  if (clearServerCache) results.push(await measure(name, fn, ctx, true));
  return results;
}

async function measureConcurrency(ctx) {
  const requests = CONCURRENCY * 2;
  const timings = [];

  const worker = async () => {
    const started = process.hrtime.bigint();
    await scenarioSlots(ctx);
    timings.push(Number(process.hrtime.bigint() - started) / 1e6);
  };

  const started = process.hrtime.bigint();
  const groups = [];
  for (let i = 0; i < requests; i += CONCURRENCY) {
    groups.push(Promise.all(Array.from({ length: Math.min(CONCURRENCY, requests - i) }, worker)));
  }
  for (const group of groups) await group;
  const wallMs = Number(process.hrtime.bigint() - started) / 1e6;

  timings.sort((a, b) => a - b);
  const percentile = (p) => timings[Math.min(timings.length - 1, Math.floor(timings.length * p))];
  return {
    requests,
    concurrency: CONCURRENCY,
    wallMs,
    throughput: (requests / wallMs) * 1000,
    p50: percentile(0.5),
    p95: percentile(0.95),
    p99: percentile(0.99),
  };
}

// ---------------------------------------------------------------------------

(async () => {
  instrument();
  const ctx = await seed();

  const results = [
    ...(await measureAll("menu (homepage)", scenarioMenu, ctx)),
    ...(await measureAll("config (booking step 1)", scenarioConfig, ctx)),
    ...(await measureAll("slots (availability)", scenarioSlots, ctx)),
  ];
  const concurrency = await measureConcurrency(ctx);

  console.log(JSON.stringify({ label, root, appointments: APPOINTMENT_COUNT, iterations: ITERATIONS, results, concurrency }, null, 2));

  // Best-effort: a confined sandbox may refuse to remove the scratch directory,
  // which must not turn a completed measurement into a failed run.
  try {
    fs.rmSync(temp, { recursive: true, force: true });
  } catch {
    /* the OS will reclaim its own temp area */
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
