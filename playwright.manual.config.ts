/**
 * Manual smoke config — chạy spec nhập liệu thật vào dev server đang chạy
 * (http://localhost:3000, DB satarobo_dev). KHÔNG globalSetup (không reset DB),
 * KHÔNG webServer (tái dùng server đang chạy). Chỉ dùng cục bộ.
 *   corepack pnpm@11 exec playwright test -c playwright.manual.config.ts
 */
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/manual",
  // Filesystem chậm trên máy này → first-compile mỗi route có thể vài phút.
  timeout: 360_000,
  expect: { timeout: 90_000 },
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: process.env.BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "on",
    locale: "vi-VN",
    timezoneId: "Asia/Ho_Chi_Minh",
  },
  projects: [{ name: "manual", use: { ...devices["Desktop Chrome"] } }],
});
