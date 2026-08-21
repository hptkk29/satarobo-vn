/**
 * Playwright config EL-07 (khu đào tạo nội bộ) — BROWSER + auth thật, Postgres LOCAL (.env.test).
 *
 * Chép khuôn `playwright.teacher.config.ts`, khác đúng ba chỗ:
 *   1. `testDir` trỏ `tests/e2e/elearning`
 *   2. Cổng riêng 3141 (teacher đang giữ 3131, dev server ở 3100) — đổi qua ELEARNING_E2E_PORT
 *   3. Bơm `ELEARNING_ENABLED=true` cho server, vì cờ mặc định OFF (`lib/flags.ts`,
 *      `=== "true"`). Không bơm thì host e-learning bounce về admin và 0 byte HTML
 *      e-learning được phục vụ — test sẽ đỏ vì lý do sai.
 *
 *   pnpm test:e2e:elearning
 *
 * ELEARNING_SKIP_WEBSERVER=1 → dùng server ngoài (phải tự bật với ELEARNING_ENABLED=true).
 *
 * ⚠️ Cấu hình này chỉ có tác dụng khi job CI `e2e-elearning` gọi nó. Repo đang có 15 file
 * `playwright.*.config.ts` mà CI chỉ gọi 5 — 10 cấu hình chết, viết đúng vẫn không ai chạy.
 * Xem `.github/workflows/ci.yml` job `e2e-elearning`.
 */
import { defineConfig, devices } from "@playwright/test";
import dotenv from "dotenv";

dotenv.config({ path: ".env.test", override: true });

const PORT = process.env.ELEARNING_E2E_PORT ?? "3141";
const BASE = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./tests/e2e/elearning",
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
    // Giữ nguyên hai dòng này: TS-18 (múi giờ, hạn chót 17:00) treo vào đúng chúng.
    locale: "vi-VN",
    timezoneId: "Asia/Ho_Chi_Minh",
  },

  projects: [{ name: "elearning", use: { ...devices["Desktop Chrome"] } }],

  webServer: process.env.ELEARNING_SKIP_WEBSERVER
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
          // Cờ ON — thiếu thì host e-learning bounce về admin (2-phase, mặc định OFF).
          ELEARNING_ENABLED: "true",
        },
      },
});
