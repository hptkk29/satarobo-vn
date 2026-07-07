/**
 * Playwright config Phase CRM (tests/e2e/crm) — Postgres LOCAL (.env.test).
 * Cùng cơ chế playwright.r7.config.ts: tsconfig.playwright.json (stub server-only),
 * global-setup (migrate deploy), workers 1. Spec CRM (task #07 cách ly import) test
 * service/query trực tiếp (db/scopedDb) → đặt CRM_SKIP_WEBSERVER=1 bỏ dev server.
 *   pnpm test:e2e:crm   (CRM_SKIP_WEBSERVER=1 pnpm test:e2e:crm để chạy nhanh, không dev server)
 */
import { defineConfig, devices } from "@playwright/test";
import dotenv from "dotenv";

dotenv.config({ path: ".env.test", override: true });

export default defineConfig({
  testDir: "./tests/e2e/crm",
  tsconfig: "./tsconfig.playwright.json",
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

  projects: [{ name: "crm", use: { ...devices["Desktop Chrome"] } }],

  webServer: process.env.CRM_SKIP_WEBSERVER
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
