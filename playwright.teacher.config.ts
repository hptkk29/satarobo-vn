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
import { napEnvTest } from "./tests/e2e/_helpers/nap-env";

napEnvTest("teacher");

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
  // 🔴 NỢ-16 (21/09/2026) — `list` PHẢI đứng đầu trong CI, đừng gỡ.
  //
  // Trước đây CI chỉ có `html` + `github`. CẢ HAI chỉ xuất kết quả **khi lượt chạy kết
  // thúc**: `html` ghi tệp ở cuối, `github` gom annotation ở cuối. Nên lượt nào bị cắt
  // giữa chừng là **mất sạch kết quả** — không đọc được ca nào đã pass, cũng không biết
  // nó dừng ở đâu.
  //
  // Đo thật 21/09: bốn job dựng webServer (smoke · A0 · site GV · e-learning) treo SAU
  // khi chạy xong ca cuối và bị `timeout-minutes` cắt. A0 có **156 ca chạy qua** mà log
  // không in nổi một dòng kết quả nào — chẩn đoán phải đi vòng qua log `[WebServer]` và
  // dấu thời gian mới suy ra được là nó treo ở lúc THOÁT chứ không phải lúc chạy test.
  //
  // `list` in MỖI CA NGAY KHI XONG, nên kể cả bị cắt vẫn còn lại toàn bộ phần đã chạy —
  // và chính dòng cuối cùng in ra là chỗ để bắt đầu truy.
  //
  // ⚠️ Đây KHÔNG phải bản vá cho việc treo. Nó là cái đèn để soi. Bản vá là chuyện
  // webServer không chịu tắt — xem NỢ-16 trong docs/hop-nhat-main-test-1609.md.
  // ⛔ Và KHÔNG nâng `timeout-minutes`: trần không phải chỗ hỏng.
  reporter: process.env.CI
    ? [["list"], ["html", { open: "never" }], ["github"]]
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
