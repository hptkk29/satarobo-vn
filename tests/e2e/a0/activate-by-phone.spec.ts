/**
 * AUTH-SĐT P5 — kích hoạt tài khoản phụ huynh bằng SĐT (DoD P5).
 *
 * Trước P5 màn `/kich-hoat` chỉ nhận email (`z.string().email()`), nên tài khoản
 * do `lib/parents/provision.ts` tạo — khoá SĐT, KHÔNG mật khẩu, có thể KHÔNG có
 * email — là ngõ cụt hoàn toàn: không đăng nhập được (chưa có mật khẩu) mà cũng
 * không kích hoạt được (form từ chối SĐT). Đây là ca chứng minh ngõ cụt đó đã
 * thông, và nó cũng là e2e ĐẦU TIÊN của màn /kich-hoat.
 *
 * **Cách biết mã OTP.** `codeHash` là HMAC một chiều nên không đọc ngược được.
 * Cửa test `OTP_TEST_FIXED_CODE` (P2) KHÔNG dùng được ở đây: job CI chạy
 * `pnpm start` ⇒ `NODE_ENV=production`, mà `genCode()` CỐ Ý throw khi thấy biến
 * đó trên production (nó biến mọi mã thành hằng số công khai). Guard ấy đúng,
 * đừng nới. Thay vào đó test **ghi đè `codeHash`** bằng hash của một mã đã biết,
 * dùng chính `NEXTAUTH_SECRET` mà server đang dùng. Cách này chỉ nạp "tri thức về
 * mã" — còn CAS tiêu mã, đếm attempts, hạn dùng, cooldown vẫn đi đường thật.
 *
 * Kênh gửi (ZNS) KHÔNG cấu hình ở môi trường test nên delivery thất bại; điều đó
 * CỐ Ý không cản test: `requestOtp` tạo `OtpRequest` TRƯỚC khi gửi, và đây là ca
 * kiểm luồng kích hoạt chứ không phải ca kiểm đường dây Zalo (ca đó là smoke thật
 * trên prod).
 *
 * CHẠY: cần Postgres LOCAL (pnpm db:test:up) — không chạy trên Supabase.
 */
import { createHmac } from "crypto";
import { test, expect } from "@playwright/test";
import { resetDb } from "../_helpers/seed";
import { db } from "../../../lib/db";
import { getSigningSecret } from "../../../lib/security/signing-key";

const PHONE = "84905777222"; // canonical — dạng cột User.phone luôn lưu
const PHONE_LOCAL = "0905 777 222"; // cùng số, cách gõ của phụ huynh
const FIXED_CODE = "424242";
const NEW_PASSWORD = "PhuHuynh@2026";

/** Cùng công thức với `hashCode()` trong lib/otp/service.ts. */
function hashOtp(code: string): string {
  return createHmac("sha256", getSigningSecret()).update(code).digest("hex");
}

/**
 * Đợi OtpRequest của `target` xuất hiện rồi đặt mã về `FIXED_CODE`.
 * Trả số dòng khớp để ca test khẳng định luôn target được lưu ĐÚNG DẠNG canonical
 * — lệch dạng ở đây là lỗi câm kinh điển: gửi được mã nhưng verify không khớp.
 */
async function forceKnownCode(target: string): Promise<number> {
  await expect
    .poll(async () => db.otpRequest.count({ where: { target, purpose: "ACTIVATION" } }), {
      timeout: 15_000,
    })
    .toBe(1);
  const res = await db.otpRequest.updateMany({
    where: { target, purpose: "ACTIVATION" },
    data: { codeHash: hashOtp(FIXED_CODE) },
  });
  return res.count;
}

/** Phụ huynh do luồng "xác nhận thanh toán" tạo: SĐT, chưa mật khẩu, KHÔNG email. */
async function seedPendingParentByPhone(phone: string) {
  return db.user.create({
    data: {
      phone,
      email: null,
      name: "PH Test P5",
      role: "PARENT",
      roles: ["PARENT"],
      accountStatus: "PENDING_ACTIVATION",
      password: null,
    },
    select: { id: true },
  });
}

async function submitIdentifier(page: import("@playwright/test").Page, value: string) {
  await page.goto("/kich-hoat");
  const field = page.getByLabel("Số điện thoại hoặc Email");
  // toPass: form là client component, fill trước khi hydrate xong sẽ bị wipe
  // (cùng lý do đã ghi ở tests/e2e/_helpers/auth.ts).
  await expect(async () => {
    await field.fill(value);
    await expect(field).toHaveValue(value, { timeout: 1_000 });
  }).toPass({ timeout: 20_000 });
  await page.getByRole("button", { name: "Gửi mã kích hoạt" }).click();
}

test.describe("[P5] Kích hoạt tài khoản bằng SĐT", () => {
  test.beforeEach(async () => {
    await resetDb();
  });

  test("[P5-C1] phụ huynh KHÔNG có email kích hoạt trọn vẹn bằng SĐT rồi đăng nhập được", async ({
    page,
  }) => {
    const user = await seedPendingParentByPhone(PHONE);

    await submitIdentifier(page, PHONE_LOCAL);

    // OtpRequest phải lưu target dạng CANONICAL dù người dùng gõ `0905…`.
    expect(await forceKnownCode(PHONE)).toBe(1);

    await page.getByLabel("Mã OTP (6 số gửi qua Zalo hoặc email)").fill(FIXED_CODE);
    await page.getByLabel("Đặt mật khẩu (≥ 8 ký tự)").fill(NEW_PASSWORD);
    await page.getByRole("button", { name: "Kích hoạt & đặt mật khẩu" }).click();

    await expect(page.getByRole("button", { name: "Đến trang đăng nhập" })).toBeVisible({
      timeout: 15_000,
    });

    const after = await db.user.findUnique({
      where: { id: user.id },
      select: { accountStatus: true, password: true, phoneVerifiedAt: true, emailVerified: true },
    });
    expect(after?.accountStatus).toBe("ACTIVE");
    expect(after?.password).toBeTruthy();
    // Kích hoạt bằng SĐT thì đánh dấu ĐÚNG kênh đã chứng minh quyền sở hữu.
    // emailVerified phải còn null — nó là điều kiện chọn email dự phòng của
    // `findVerifiedFallbackEmail`, set bừa = gửi mã tới hòm thư chưa ai xác nhận.
    expect(after?.phoneVerifiedAt).not.toBeNull();
    expect(after?.emailVerified).toBeNull();

    // Đóng vòng: mật khẩu vừa đặt dùng đăng nhập được bằng chính SĐT đó.
    await page.goto("/login");
    const idField = page.getByLabel("Số điện thoại hoặc Email");
    await expect(async () => {
      await idField.fill(PHONE_LOCAL);
      await page.getByLabel("Mật khẩu").fill(NEW_PASSWORD);
      await expect(idField).toHaveValue(PHONE_LOCAL, { timeout: 1_000 });
    }).toPass({ timeout: 20_000 });
    await page.getByRole("button", { name: "Đăng nhập" }).click();
    await expect(page).not.toHaveURL(/\/login/, { timeout: 15_000 });
  });

  test("[P5-C2] SĐT không có tài khoản → vẫn trả lời y hệt (không lộ số nào tồn tại)", async ({
    page,
  }) => {
    await submitIdentifier(page, "0905000999");

    // Bịt oracle liệt kê (P0 §3.4): giao diện chuyển bước như thường...
    await expect(page.getByLabel("Mã OTP (6 số gửi qua Zalo hoặc email)")).toBeVisible({
      timeout: 15_000,
    });
    // ...nhưng KHÔNG có OtpRequest nào được tạo.
    expect(await db.otpRequest.count()).toBe(0);
  });

  test("[P5-C3] số CỐ ĐỊNH bị từ chối tại chỗ (ZNS không gửi vào số bàn được)", async ({
    page,
  }) => {
    await submitIdentifier(page, "02363123456");
    await expect(
      page.getByText("Số điện thoại hoặc email không hợp lệ", { exact: false }).first(),
    ).toBeVisible({ timeout: 10_000 });
    expect(await db.otpRequest.count()).toBe(0);
  });

  test("[P5-C4] hồi quy: tài khoản cũ khoá EMAIL vẫn kích hoạt bằng email như trước", async ({
    page,
  }) => {
    const email = "ph-cu-p5@satarobo.test";
    const user = await db.user.create({
      data: {
        email,
        phone: null,
        name: "PH cũ",
        role: "PARENT",
        roles: ["PARENT"],
        accountStatus: "PENDING_ACTIVATION",
        password: null,
      },
      select: { id: true },
    });

    await submitIdentifier(page, email.toUpperCase()); // hoa/thường không được đổi kết quả

    expect(await forceKnownCode(email)).toBe(1);

    await page.getByLabel("Mã OTP (6 số gửi qua Zalo hoặc email)").fill(FIXED_CODE);
    await page.getByLabel("Đặt mật khẩu (≥ 8 ký tự)").fill(NEW_PASSWORD);
    await page.getByRole("button", { name: "Kích hoạt & đặt mật khẩu" }).click();

    await expect(page.getByRole("button", { name: "Đến trang đăng nhập" })).toBeVisible({
      timeout: 15_000,
    });
    const after = await db.user.findUnique({
      where: { id: user.id },
      select: { accountStatus: true, emailVerified: true, phoneVerifiedAt: true },
    });
    expect(after?.accountStatus).toBe("ACTIVE");
    expect(after?.emailVerified).not.toBeNull();
    expect(after?.phoneVerifiedAt).toBeNull();
  });
});
