/**
 * Playwright config #06 (site giáo viên) — BROWSER + auth thật, Postgres LOCAL (.env.test).
 *
 * Khác các config phase khác: BẮT BUỘC dev server (không có *_SKIP_WEBSERVER mặc định)
 * và bơm `TEACHER_SITE_ENABLED=true` cho server — vì teacher layout gate 3 tầng, tầng 2
 * đá về /dashboard khi flag OFF (2-phase L5). Không có flag ON thì /teacher/* KHÔNG render.
 *
 *   pnpm exec playwright test -c playwright.teacher.config.ts
 *
 * Cổng riêng (3131) để KHÔNG đụng dev server đang chạy ở 3100. Đổi qua TEACHER_E2E_PORT.
 * TEACHER_SKIP_WEBSERVER=1 → dùng server ngoài (phải tự bật với TEACHER_SITE_ENABLED=true).
 */
import { defineConfig, devices } from "@playwright/test";
import dotenv from "dotenv";

dotenv.config({ path: ".env.test", override: true });

const PORT = process.env.TEACHER_E2E_PORT ?? "3131";
const BASE = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./tests/e2e/teacher",
  tsconfig: "./tsconfig.playwright.json",
  globalSetup: "./tests/e2e/a0/global-setup.ts",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI
    ? [["html", { open: "never" }], ["github"]]
    : [["html", { open: "never" }], ["list"]],

  use: {
    baseURL: process.env.BASE_URL ?? BASE,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    locale: "vi-VN",
    timezoneId: "Asia/Ho_Chi_Minh",
  },

  projects: [{ name: "teacher", use: { ...devices["Desktop Chrome"] } }],

  webServer: process.env.TEACHER_SKIP_WEBSERVER
    ? undefined
    : {
        command: process.env.CI ? `pnpm start -p ${PORT}` : `pnpm dev -p ${PORT}`,
        url: `${BASE}/login`,
        reuseExistingServer: false,
        timeout: 240_000,
        env: {
          DATABASE_URL: process.env.DATABASE_URL ?? "",
          DIRECT_URL: process.env.DIRECT_URL ?? "",
          NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET ?? "",
          NEXTAUTH_URL: BASE,
          NEXT_PUBLIC_APP_URL: BASE,
          // L5 flag ON — nếu thiếu, teacher layout redirect /teacher/* → /dashboard.
          TEACHER_SITE_ENABLED: "true",
        },
      },
});
