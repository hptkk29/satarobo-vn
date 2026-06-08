/**
 * Playwright config cho Phase R1 (tests/e2e/r1) — Postgres LOCAL (.env.test).
 * Cùng cơ chế playwright.a0.config.ts; tái dùng global-setup (migrate deploy).
 *   pnpm db:test:up && pnpm test:e2e:r1
 */
import { defineConfig, devices } from "@playwright/test";
import dotenv from "dotenv";

dotenv.config({ path: ".env.test", override: true });

export default defineConfig({
  testDir: "./tests/e2e/r1",
  globalSetup: "./tests/e2e/a0/global-setup.ts",
  timeout: 30_000,
  expect: { timeout: 5_000 },
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI
    ? [["html", { open: "never" }], ["github"]]
    : [["html", { open: "never" }], ["list"]],

  use: {
    baseURL: process.env.BASE_URL ?? "http://localhost:3100",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    locale: "vi-VN",
    timezoneId: "Asia/Ho_Chi_Minh",
  },

  projects: [{ name: "r1", use: { ...devices["Desktop Chrome"] } }],

  webServer: process.env.R1_SKIP_WEBSERVER
    ? undefined
    : {
        command: process.env.CI ? "pnpm start -p 3100" : "pnpm dev -p 3100",
        url: "http://localhost:3100",
        reuseExistingServer: false,
        timeout: 120_000,
        env: {
          DATABASE_URL: process.env.DATABASE_URL ?? "",
          DIRECT_URL: process.env.DIRECT_URL ?? "",
          NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET ?? "",
          NEXTAUTH_URL: "http://localhost:3100",
          NEXT_PUBLIC_APP_URL: "http://localhost:3100",
        },
      },
});
