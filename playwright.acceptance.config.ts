import { defineConfig, devices } from "@playwright/test";

/**
 * NGHIỆM THU [TAY] module chat — chạy trên MÔI TRƯỜNG ĐÃ TRIỂN KHAI (test.satarobo.vn),
 * KHÔNG phải localhost, KHÔNG `resetDb`, KHÔNG webServer.
 *
 * Vì sao phải là config riêng:
 *  • `playwright.config.ts` (smoke) trỏ localhost + `testIgnore` theo thư mục phase;
 *    bộ này nằm ngoài `tests/e2e` nên không bị suite nào nhặt nhầm.
 *  • Bộ này KHÔNG được chạy trong CI: nó ghi dữ liệu thật vào DB dev/test và cần
 *    Supabase Realtime + R2 thật.
 *
 * ⚠️ MỘT CONTEXT = MỘT VAI. Trên test.satarobo.vn mọi site (`/admin`, `/portal`,
 * `/teacher`) nằm CÙNG một host (`proxy.ts` BRANCH 3 — không có subdomain split), nên
 * hai vai trong CÙNG một browser profile sẽ đá cookie của nhau. Vai được tách bằng
 * `storageState` riêng cho từng context (xem tests/acceptance/_setup.ts).
 *
 * Chạy:
 *   pnpm exec tsx scripts/_zztest-chat-nghiemthu-seed.ts
 *   pnpm exec playwright test -c playwright.acceptance.config.ts
 */
export default defineConfig({
  testDir: "./tests/acceptance",
  globalSetup: "./tests/acceptance/_setup.ts",
  // TS-09 có đoạn ngắt mạng 10 phút, TS-14 chờ signed URL hết hạn 6 phút — trần phải
  // cao hơn tổng thời gian CHỜ THẬT của kịch bản, không phải thời gian "chạy".
  timeout: 22 * 60_000,
  expect: { timeout: 15_000 },
  // Kịch bản dùng chung một bộ dữ liệu (LopA/LopB) và có bước khoá hội thoại →
  // chạy song song là hai kịch bản giẫm chân nhau. Tuần tự, có chủ đích.
  workers: 1,
  fullyParallel: false,
  retries: 0,
  // Đặt trong `playwright-report/` để dùng chung dòng .gitignore sẵn có — báo cáo
  // nghiệm thu chứa nội dung tin nhắn thật, không được lọt vào commit.
  reporter: [["list"], ["html", { outputFolder: "playwright-report/acceptance", open: "never" }]],
  outputDir: "test-results/acceptance",
  use: {
    baseURL: process.env.ACCEPT_BASE_URL ?? "https://test.satarobo.vn",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
    // Desktop: nút "Gửi" chỉ hiện chữ từ breakpoint sm trở lên (accessible name).
    ...devices["Desktop Chrome"],
    viewport: { width: 1440, height: 900 },
    locale: "vi-VN",
    timezoneId: "Asia/Ho_Chi_Minh",
  },
  projects: [{ name: "chat-acceptance" }],
});
