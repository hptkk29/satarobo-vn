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
  // Phase suite (a0, r*, fl) có config riêng (playwright.<phase>.config.ts): Postgres
  // LOCAL + tsconfig.playwright.json (stub server-only) + globalSetup + workers 1.
  // Loại khỏi smoke (smoke không có setup/seed → fl service-spec sẽ fail; fl/* import
  // lib server-only không resolve). FL chạy ở playwright.fl.config.ts + job CI riêng.
  // `teacher/` = spec browser site GV, CHỈ chạy qua playwright.teacher.config.ts (cần
  // webServer với TEACHER_SITE_ENABLED=true). Smoke không có server đó → loại như phase dir.
  // `elearning/` = spec browser khu đào tạo nội bộ, CHỈ chạy qua
  // playwright.elearning.config.ts — bộ đó bơm ELEARNING_ENABLED=true, còn smoke chạy
  // cờ OFF (mặc định) nên cho chạy ở đây là test đỏ vì lý do sai.
  testIgnore: [
    "**/a0/**",
    "**/r[0-9]*/**",
    "**/fl/**",
    "**/crm/**",
    "**/teacher/**",
    "**/elearning/**",
  ],
  // Each test gets 30s timeout
  timeout: 30_000,
  expect: { timeout: 5_000 },

  // CI gets retries, dev doesn't (faster iteration)
  retries: process.env.CI ? 2 : 0,
  // workers:1 — smoke-lms spec self-seed DB chung (resetDb + slug cố định) trong beforeAll;
  // chạy song song 2 project (chromium+mobile) → 2 beforeAll đồng thời → đụng unique slug.
  // Serial hoá để tránh (smoke nhỏ, không đáng song song).
  workers: 1,

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
