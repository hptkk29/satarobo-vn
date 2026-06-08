/**
 * A0-00 — Auth helpers cho Playwright (login thật qua form /login).
 *
 * Dùng đường đăng nhập THẬT (Credentials provider) thay vì test-only route →
 * test sát production, không mở backdoor. seedUser tạo user (password đã hash),
 * loginAs đăng nhập qua form.
 */
import { expect, type Page } from "@playwright/test";
import { seedUser, type SeedUserInput } from "./seed";
import { TEST_PASSWORD } from "./fixtures";

/** Đăng nhập qua form /login với email + password đã biết. */
export async function login(
  page: Page,
  creds: { email: string; password?: string; callbackUrl?: string },
): Promise<void> {
  const url = creds.callbackUrl
    ? `/login?callbackUrl=${encodeURIComponent(creds.callbackUrl)}`
    : "/login";
  await page.goto(url);
  await page.getByLabel("Email").fill(creds.email);
  await page.getByLabel("Mật khẩu").fill(creds.password ?? TEST_PASSWORD);
  await page.getByRole("button", { name: "Đăng nhập" }).click();
  // Đăng nhập thành công → rời khỏi /login (router.push(callbackUrl)).
  await expect(page).not.toHaveURL(/\/login(\?|$)/, { timeout: 10_000 });
}

/**
 * Seed 1 user theo spec rồi đăng nhập luôn. Trả về user đã tạo.
 * Tiện cho AC1/AC4: `await loginAs(page, { email, role: "SUPER_ADMIN" })`.
 */
export async function loginAs(
  page: Page,
  spec: SeedUserInput & { callbackUrl?: string },
): Promise<{ id: string; email: string }> {
  const user = await seedUser(spec);
  await login(page, {
    email: spec.email,
    password: spec.password,
    callbackUrl: spec.callbackUrl,
  });
  return user;
}
