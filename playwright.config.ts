import { defineConfig, devices } from "@playwright/test";
import path from "node:path";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(__dirname, ".env.test") });

const PORT = process.env.E2E_PORT ?? "3001";
const BASE_URL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;

if (!process.env.DATABASE_URL || !/overra_test/i.test(process.env.DATABASE_URL)) {
  throw new Error("playwright.config.ts: DATABASE_URL must point at overra_test (load .env.test).");
}

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? "github" : "list",
  globalSetup: path.resolve(__dirname, "./tests/e2e/global-setup.ts"),
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: `E2E_DIST_DIR=.next-e2e npx next build && E2E_DIST_DIR=.next-e2e npx next start --port ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
    env: {
      DATABASE_URL: process.env.DATABASE_URL,
      JWT_SECRET: process.env.JWT_SECRET ?? "test-jwt-secret-min-32-characters-long-xxxxxx",
      NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET ?? "test-nextauth-secret-min-32-chars-xxxxxxxx",
      NEXTAUTH_URL: process.env.NEXTAUTH_URL ?? BASE_URL,
    },
  },
});
