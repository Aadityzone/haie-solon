import fs from "node:fs";
import path from "node:path";

/**
 * Removes the browser-test database so every Playwright run starts from the
 * seeded catalogue and empty availability state.
 *
 * This is a standalone script rather than config-module code because Playwright
 * evaluates its config more than once per run; a destructive reset there would
 * race the database the running server has open.
 *
 * Only these specific files are removed, never the containing directory:
 * libSQL cannot create a database inside a directory that does not exist.
 */
const directory = path.join(process.cwd(), ".playwright");
// The config passes the exact path it will serve from, so a namespaced run
// resets its own database and never one another run has open.
const database = process.env.PLAYWRIGHT_DB_PATH || path.join(directory, "salon-e2e.db");

for (const file of [database, `${database}-wal`, `${database}-shm`]) {
  fs.rmSync(file, { force: true });
}
fs.mkdirSync(directory, { recursive: true });

console.log(`[e2e] reset test database ${database}`);
