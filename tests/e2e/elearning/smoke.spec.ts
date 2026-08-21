/**
 * EL-07 · AC5 — smoke của harness e2e module đào tạo nội bộ.
 *
 * Bài này KHÔNG kiểm nghiệp vụ e-learning (chưa có route group nào — đó là EL-01).
 * Nó chứng minh đúng một điều: cấu hình `playwright.elearning.config.ts` chạy được,
 * server lên được với `ELEARNING_ENABLED=true`, và job CI `e2e-elearning` có việc để
 * làm. Repo đang có 15 file `playwright.*.config.ts` mà CI chỉ gọi 5 — cấu hình viết
 * đúng nhưng không ai chạy thì y hệt không có.
 *
 * EL-01 sẽ thay bài này bằng `host-routing.spec.ts` + `employee-gate.spec.ts`.
 */
import { test, expect } from "@playwright/test";

test.describe("[EL-07] harness e2e e-learning", () => {
  test("server lên được và trang đăng nhập render", async ({ page }) => {
    const res = await page.goto("/login");
    expect(res?.status()).toBeLessThan(400);
    await expect(page.locator("form")).toBeVisible();
  });

  test("cờ ELEARNING_ENABLED đã được bơm cho server", async ({ page }) => {
    // Cờ bật nhưng route group chưa tồn tại (EL-01) ⇒ 404 là kết quả ĐÚNG ở giai đoạn
    // này. Điều cần khẳng định: KHÔNG phải 500, tức server không vỡ vì cờ.
    const res = await page.goto("/elearning");
    expect(res?.status()).not.toBe(500);
  });
});
