import { defineConfig } from "@playwright/test";

const PORT = 3200;

/**
 * End-to-end tests against a production build with its own database
 * (data/e2e.db, reset on every run). Uses the installed Google Chrome by
 * default; set PW_CHANNEL=chromium after `npx playwright install chromium`
 * to use Playwright's own browser instead.
 */
export default defineConfig({
  testDir: "e2e",
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    channel: process.env.PW_CHANNEL ?? "chrome",
    viewport: { width: 1440, height: 1000 },
    timezoneId: "Europe/Kyiv",
    trace: "retain-on-failure",
  },
  webServer: {
    command: `rm -f data/e2e.db data/e2e.db-wal data/e2e.db-shm && rm -rf .next/cache/fetch-cache .next/server/route-cache && next build && next start -p ${PORT}`,
    url: `http://localhost:${PORT}/settings`,
    timeout: 300_000,
    reuseExistingServer: false,
    env: { DATABASE_PATH: "data/e2e.db", SITE_URL: `http://localhost:${PORT}` },
  },
});
