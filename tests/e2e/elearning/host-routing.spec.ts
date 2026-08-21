/**
 * EL-01 PR2 · AC1–AC4 — định tuyến host thứ 6 ở tầng CHẠY THẬT.
 *
 * Khác `route-policy.test.ts` (thuần, không server): bài này kiểm cả chuỗi
 * middleware → layout RSC → render, tức bắt được những thứ đơn vị test không thấy:
 * rewrite có ra đúng route group không, layout gate có chặn không, và cờ có thật sự
 * được đọc ở tiến trình server không.
 *
 * Cấu hình bơm `ELEARNING_ENABLED=true` cho webServer (playwright.elearning.config.ts).
 * Trên localhost không có subdomain nên đi path thật `/elearning/*` — nhánh BRANCH 3
 * của proxy.ts, đối xứng với site giáo viên.
 */
import { test, expect } from "@playwright/test";

test.describe("[EL-01] khu đào tạo nội bộ — định tuyến và cổng vào", () => {
  test("chưa đăng nhập → đá về /login kèm callbackUrl", async ({ page }) => {
    await page.goto("/elearning");
    await expect(page).toHaveURL(/\/login/);
    expect(page.url()).toContain("callbackUrl");
  });

  test("trang /login vẫn phục vụ bình thường (không bị rewrite nuốt)", async ({ page }) => {
    const res = await page.goto("/login");
    expect(res?.status()).toBeLessThan(400);
    await expect(page.locator("form")).toBeVisible();
  });

  test("khu nội bộ phải noindex — không được lọt lên công cụ tìm kiếm", async ({ page }) => {
    const res = await page.goto("/elearning");
    const robots = res?.headers()["x-robots-tag"] ?? "";
    // Đá về /login vẫn phải giữ noindex ở chặng đầu; nếu header rỗng thì kiểm meta.
    if (!robots) {
      const meta = await page.locator('meta[name="robots"]').getAttribute("content");
      expect(meta ?? "").toContain("noindex");
    } else {
      expect(robots).toContain("noindex");
    }
  });
});
