import { defineConfig, devices } from "@playwright/test";
import os from "node:os";
import path from "node:path";

/**
 * Browser tests run against a production build and a dedicated libSQL file, so
 * the development database in `salon.db` is never read or mutated.
 *
 * The owner credential below is a throwaway value for this test server only.
 * It is not a production secret and must never be reused as one.
 */
const PORT = Number(process.env.PLAYWRIGHT_PORT || 3210);
const baseURL = `http://127.0.0.1:${PORT}`;

/**
 * An optional run id namespaces both the database and the build output, so two
 * Playwright runs can proceed at once without one deleting the other's database
 * or rebuilding over its output. Unset, the paths are exactly as before.
 */
const RUN_ID = process.env.PLAYWRIGHT_RUN_ID?.trim();
const TEST_DB_PATH = path.join(
  process.cwd(),
  ".playwright",
  RUN_ID ? `salon-e2e-${RUN_ID}.db` : "salon-e2e.db"
);

/**
 * Turbopack removes the dependency junctions under `<distDir>/node_modules` as
 * the build finishes. On this OneDrive-synced checkout that unlink fails with
 * EPERM, so the browser suite builds into `.playwright/build` instead. The env
 * var is read by `next.config.ts` for both `next build` and `next start`.
 */
const TEST_DIST_DIR =
  process.env.PLAYWRIGHT_DIST_DIR || (RUN_ID ? `.playwright/build-${RUN_ID}` : ".playwright/build");

/**
 * Traces, videos, and the failure context are written per test. On this
 * OneDrive-synced checkout the sync client races Playwright for those files and
 * the run fails while closing the browser context with ENOENT, which looks like
 * a test failure but is not one. Keeping the artifacts outside the synced tree
 * removes the race; `PLAYWRIGHT_OUTPUT_DIR` overrides the location if needed.
 */
const TEST_OUTPUT_DIR =
  process.env.PLAYWRIGHT_OUTPUT_DIR ||
  path.join(os.tmpdir(), RUN_ID ? `salon-playwright-${RUN_ID}` : "salon-playwright");

export default defineConfig({
  testDir: "./tests/e2e",
  outputDir: TEST_OUTPUT_DIR,
  // The suite shares one SQLite file and mutates real booking state, so tests
  // run one at a time.
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  use: {
    baseURL,
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop-chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    { name: "mobile-chromium", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    // Reset the isolated database, then build and serve with the same
    // environment so prerendered pages and the running server agree.
    command: `node tests/e2e/reset-db.mjs && npx next build && npx next start -p ${PORT}`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 240_000,
    env: {
      SALON_DB_PATH: TEST_DB_PATH,
      DATABASE_URL: `file:${TEST_DB_PATH}`,
      PLAYWRIGHT_DB_PATH: TEST_DB_PATH,
      AUTH_SECRET: "playwright-e2e-auth-secret-not-for-production-use",
      OWNER_SETUP_TOKEN: "playwright-e2e-setup-token",
      OWNER_PASSWORD: "playwright-e2e-owner-password",
      // One process answers every request in this run, so the per-network
      // booking limit would only throttle the suite's own traffic rather than
      // an attacker. This raises the ceiling for the test server alone.
      BOOKING_RATE_LIMIT_MAX: "200",
      NEXT_DIST_DIR: TEST_DIST_DIR,
      // WhatsApp credentials are intentionally absent: the suite asserts that an
      // unconfigured integration records SKIPPED rather than claiming delivery.
    },
  },
});
