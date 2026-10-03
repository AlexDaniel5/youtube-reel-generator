import { defineConfig, devices } from "@playwright/test";
import { E2E_BASE_URL, E2E_PORT, e2eEnv } from "./e2e/support/env";

const isCI = !!process.env.CI;

export default defineConfig({
  testDir: "e2e",
  // Jobs run in-process and FFmpeg is CPU-bound, so run serially for stable
  // timings. Every test creates its own project, so order doesn't matter.
  fullyParallel: false,
  workers: 1,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  // Fast default; groups that render video raise it with test.setTimeout().
  timeout: 30_000,
  expect: { timeout: 10_000 },
  reporter: [["list"], ["html", { open: "never" }]],
  globalTeardown: "./e2e/support/global-teardown.ts",

  use: {
    baseURL: E2E_BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },

  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],

  webServer: {
    // Reset db + storage, then serve a production build: no on-demand
    // compilation, so the first request isn't slower than the rest.
    command: `npx tsx e2e/support/prepare.ts && npx next build && npx next start -p ${E2E_PORT} -H 127.0.0.1`,
    url: E2E_BASE_URL,
    env: e2eEnv,
    // Never attach to an already-running dev server: it would be using dev.db.
    reuseExistingServer: false,
    timeout: 240_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
