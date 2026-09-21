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
import { napEnvTest } from "./tests/e2e/_helpers/nap-env";

// Nạp .env.test TRƯỚC mọi thứ — workers + webServer kế thừa process.env này.
napEnvTest("a0");

export default defineConfig({
  testDir: "./tests/e2e/a0",
  globalSetup: "./tests/e2e/a0/global-setup.ts",
  timeout: 30_000,
  expect: { timeout: 5_000 },
  retries: process.env.CI ? 2 : 0,
  workers: 1, // serial: nhiều spec share resetDb/seed chung 1 DB test
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

  // A0_SKIP_WEBSERVER=1 → bỏ qua dựng Next (chạy nhanh nhóm test thuần-DB,
  // không cần browser). Mặc định vẫn dựng server cho test cần page (loginAs).
  webServer: process.env.A0_SKIP_WEBSERVER
    ? undefined
    : {
        command: process.env.CI ? "pnpm start -p 3100" : "pnpm dev -p 3100",
        url: "http://localhost:3100",
        // Dựng server test mới với env test — KHÔNG tái dùng dev server có sẵn.
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
