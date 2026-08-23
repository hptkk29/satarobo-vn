/**
 * Playwright config Phase R7 (tests/e2e/r7) — Postgres LOCAL (.env.test).
 * Cùng cơ chế playwright.r6.config.ts; tái dùng global-setup (migrate deploy).
 *   pnpm test:e2e:r7
 * Mọi spec R7 test service/action trực tiếp (DB) → đặt R7_SKIP_WEBSERVER=1 bỏ dev server.
 */
import { defineConfig, devices } from "@playwright/test";
import dotenv from "dotenv";

dotenv.config({ path: ".env.test", override: true });

export default defineConfig({
  testDir: "./tests/e2e/r7",
  tsconfig: "./tsconfig.playwright.json",
  globalSetup: "./tests/e2e/a0/global-setup.ts",
  timeout: 30_000,
  expect: { timeout: 5_000 },
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  // Playwright tự dừng TRƯỚC trần job (30) ⇒ nó còn kịp in tóm tắt và ghi báo cáo.
  // Không có dòng này thì GitHub giết tiến trình giữa chừng, không tóm tắt, không artifact.
  globalTimeout: 25 * 60_000,
  // `list` CẢ Ở CI. Reporter cũ (html + github) không in gì trong lúc chạy, nên một lần
  // chạy XANH cũng im lặng 12 phút — và im lặng đó bị đọc nhầm thành "job treo", tốn
  // một vòng điều tra. Có `list` thì nhìn log biết đang ở test nào.
  reporter: process.env.CI
    ? [["list"], ["html", { open: "never" }], ["github"]]
    : [["html", { open: "never" }], ["list"]],

  use: {
    baseURL: process.env.BASE_URL ?? "http://localhost:3100",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    locale: "vi-VN",
    timezoneId: "Asia/Ho_Chi_Minh",
  },

  projects: [{ name: "r7", use: { ...devices["Desktop Chrome"] } }],

  webServer: process.env.R7_SKIP_WEBSERVER
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
