/**
 * A0-00 → AUTH-SĐT P2 — Auth helpers cho Playwright (login thật qua form /login).
 *
 * Dùng đường đăng nhập THẬT (Credentials provider) thay vì test-only route →
 * test sát production, không mở backdoor. seedUser tạo user (password đã hash),
 * loginAs đăng nhập qua form.
 *
 * P2: đây là BẢN DUY NHẤT của logic login — tests/manual/* và mọi suite import
 * từ đây, đừng chép lại khối fill/click ra spec. `login` thuần Playwright
 * (không đụng DB) nên import được từ mọi chỗ kể cả tests/manual (chạy trên dev
 * DB, không có .env.test); `seed` chỉ được nạp lười bên trong `loginAs` để
 * import file này không kéo Prisma client vào process.
 */
import { expect, type Page } from "@playwright/test";
import type { SeedUserInput } from "./seed";
import { TEST_PASSWORD } from "./fixtures";

/**
 * Đăng nhập qua form /login với email + password đã biết.
 *
 * KHÔNG fill "mộc" một lần: form Waves là controlled input — fill trước khi
 * React hydrate xong sẽ bị hydration XOÁ TRẮNG giá trị → validation "Email
 * không hợp lệ" chặn, signIn không bao giờ bắn (fail câm). Điền rồi xác nhận
 * giá trị CÒN DÍNH (hydration muộn vẫn có thể wipe sau "load") — bị wipe thì
 * toPass() điền lại tới khi ổn định.
 */
export async function login(
  page: Page,
  creds: {
    email: string;
    password?: string;
    callbackUrl?: string;
    /** Trần chờ rời /login sau khi bấm Đăng nhập — dev server cold-compile chậm thì nới lên (tests/manual dùng 120_000). */
    timeout?: number;
  },
): Promise<void> {
  const url = creds.callbackUrl
    ? `/login?callbackUrl=${encodeURIComponent(creds.callbackUrl)}`
    : "/login";
  await page.goto(url);
  const email = page.getByLabel("Email");
  await expect(async () => {
    await email.fill(creds.email);
    await page.getByLabel("Mật khẩu").fill(creds.password ?? TEST_PASSWORD);
    await expect(email).toHaveValue(creds.email, { timeout: 1_000 });
  }).toPass({ timeout: 20_000 });
  await page.getByRole("button", { name: "Đăng nhập" }).click();
  // Đăng nhập thành công → rời khỏi /login (router.push(callbackUrl)).
  await expect(page).not.toHaveURL(/\/login(\?|$)/, { timeout: creds.timeout ?? 30_000 });
}

/**
 * Seed 1 user theo spec rồi đăng nhập luôn. Trả về user đã tạo.
 * Tiện cho AC1/AC4: `await loginAs(page, { email, role: "SUPER_ADMIN" })`.
 */
export async function loginAs(
  page: Page,
  spec: SeedUserInput & { callbackUrl?: string },
): Promise<{ id: string; email: string }> {
  // Nạp lười: seed.ts import lib/db (Prisma) lúc load — chỉ kéo vào khi thật sự seed.
  const { seedUser } = await import("./seed");
  const user = await seedUser(spec);
  await login(page, {
    email: spec.email,
    password: spec.password,
    callbackUrl: spec.callbackUrl,
  });
  return user;
}
