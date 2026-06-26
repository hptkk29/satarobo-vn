import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config — Phase 5.1
 * Docs: https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: "./tests/e2e",
  // Suite smoke CHỈ chạy smoke.spec.ts (top-level). Mọi phase suite (a0, r1..r7) có
  // config riêng (playwright.<phase>.config.ts): chạy trên Postgres LOCAL + dùng
  // tsconfig.playwright.json (stub `server-only`/`@/lib/auth`) + resetDb. Nếu để smoke
  // collect chúng → resetDb từ chối trên DB seed CI/Supabase + `server-only` không
  // resolve (thiếu stub) → lỗi collect. Loại toàn bộ phase dir khỏi suite smoke.
  testIgnore: ["**/a0/**", "**/r[0-9]*/**"],
  // FL-R2 — stub `server-only`/`@/lib/auth` cho spec import lib server-side (vd
  // tests/e2e/fl/convert-installment.spec → lib/orders/installments.ts có `server-only`,
  // không resolve được trong runner). Cùng cơ chế phase config (playwright.r*.config.ts).
  tsconfig: "./tsconfig.playwright.json",
  // Each test gets 30s timeout
  timeout: 30_000,
  expect: { timeout: 5_000 },

  // CI gets retries, dev doesn't (faster iteration)
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,

  // Reporter
  reporter: process.env.CI
    ? [["html"], ["github"]]
    : [["html", { open: "never" }], ["list"]],

  use: {
    baseURL: process.env.BASE_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    // Localize to Vietnamese
    locale: "vi-VN",
    timezoneId: "Asia/Ho_Chi_Minh",
  },

  projects: [
    {
      name: "chromium-desktop",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "mobile-chrome",
      use: { ...devices["Pixel 5"] },
    },
  ],

  // Start dev server before tests (skip in CI — server already up from `pnpm build && pnpm start`)
  webServer: process.env.CI
    ? {
        command: "pnpm start",
        url: "http://localhost:3000",
        reuseExistingServer: false,
        timeout: 120_000,
      }
    : {
        command: "pnpm dev",
        url: "http://localhost:3000",
        reuseExistingServer: true,
        timeout: 60_000,
      },
});
