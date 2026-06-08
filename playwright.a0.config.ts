/**
 * Playwright config RIÊNG cho Phase A0 (tests/e2e/a0).
 *
 * Tách khỏi playwright.config.ts (smoke) vì A0 chạy trên Postgres LOCAL (.env.test),
 * còn smoke chạy trên DB seed của CI. webServer dev/start ở đây kế thừa env test
 * → app dùng đúng DB test, không đụng Supabase.
 *
 *   pnpm db:test:up && pnpm test:e2e:a0
 */
import { defineConfig, devices } from "@playwright/test";
import dotenv from "dotenv";

// Nạp .env.test TRƯỚC mọi thứ — workers + webServer kế thừa process.env này.
dotenv.config({ path: ".env.test", override: true });

export default defineConfig({
  testDir: "./tests/e2e/a0",
  globalSetup: "./tests/e2e/a0/global-setup.ts",
  timeout: 30_000,
  expect: { timeout: 5_000 },
  retries: process.env.CI ? 2 : 0,
  workers: 1, // serial: nhiều spec share resetDb/seed chung 1 DB test
  reporter: process.env.CI
    ? [["html", { open: "never" }], ["github"]]
    : [["html", { open: "never" }], ["list"]],

  // Cổng RIÊNG (3100) để KHÔNG đụng dev server thường (3000, có thể đang trỏ
  // Supabase) — tránh app dùng 1 DB còn resetDb dùng DB khác.
  use: {
    baseURL: process.env.BASE_URL ?? "http://localhost:3100",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    locale: "vi-VN",
    timezoneId: "Asia/Ho_Chi_Minh",
  },

  projects: [
    { name: "a0", use: { ...devices["Desktop Chrome"] } },
  ],

  webServer: {
    command: process.env.CI ? "pnpm start -p 3100" : "pnpm dev -p 3100",
    url: "http://localhost:3100",
    // Luôn dựng server test mới với env test — KHÔNG tái dùng dev server có sẵn.
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
