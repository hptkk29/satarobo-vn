"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/auth/check-permission";
import { setMisaEnabled, getMisaConfig, syncToMisa } from "@/lib/misa/service";
import { setPaymentConfig } from "@/lib/payments/vietqr";
import { canonicalPhone, formatPhoneVN } from "@/lib/phone";
import { zaloOtpProvider } from "@/lib/zalo/otp-provider";
import { znsProvider } from "@/lib/zalo/provider";
import { rateLimit } from "@/lib/rate-limit";
import { writeAudit } from "@/lib/audit/audit-log";
import { randomInt } from "crypto";
import { z } from "zod";

// C6 — bật/tắt MISA + chạy thử sync. Gate settings:edit (SUPER_ADMIN).

export async function toggleMisa(): Promise<{ ok: boolean; error?: string; enabled?: boolean }> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Chưa đăng nhập" };
  if (!(await checkPermission("settings:edit"))) return { ok: false, error: "Không có quyền" };

  const cur = await getMisaConfig();
  await setMisaEnabled(!cur.isEnabled);
  revalidatePath("/admin/tich-hop");
  return { ok: true, enabled: !cur.isEnabled };
}

export async function testMisaSync(): Promise<{ ok: boolean; error?: string; status?: string }> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Chưa đăng nhập" };
  if (!(await checkPermission("settings:edit"))) return { ok: false, error: "Không có quyền" };

  const res = await syncToMisa({ action: "TEST_PING", payload: { ping: true, at: "manual-test" } });
  revalidatePath("/admin/tich-hop");
  return { ok: true, status: res.status };
}

/**
 * AUTH-SĐT P4 — gửi thử 1 tin ZNS mẫu Xác thực (bước 1 checklist "Bật live",
 * docs/otp-service.md). Luồng OTP tới SĐT chỉ có từ P5, nên trước đó KHÔNG có
 * đường nào trong giao diện chạm tới ZNS — không có nút này thì không kiểm được
 * template/tên tham số trước khi mở cho phụ huynh thật.
 *
 * Tiền thật: mỗi tin gửi THÀNH CÔNG tốn ~300đ (QĐ-E) ⇒ gate `settings:edit` +
 * trần 5 lần/giờ/người + ghi audit. Mã gửi đi là số ngẫu nhiên KHÔNG gắn với
 * tài khoản nào (không tạo `OtpRequest`) — chỉ để đối chiếu nội dung tin.
 */
export async function sendZnsTest(
  input: unknown,
): Promise<{ ok: boolean; error?: string; detail?: string; live?: boolean }> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Chưa đăng nhập" };
  if (!(await checkPermission("settings:edit"))) return { ok: false, error: "Không có quyền" };

  const phone = canonicalPhone((input as { phone?: unknown })?.phone);
  if (!phone) return { ok: false, error: "Số điện thoại không hợp lệ (chỉ nhận di động VN)" };

  const rl = await rateLimit({ key: `zns-test:${session.user.id}`, max: 5, windowMs: 3_600_000 });
  if (!rl.success) return { ok: false, error: "Đã gửi thử quá 5 lần trong 1 giờ. Thử lại sau." };

  const live = znsProvider.isLive();
  const code = String(randomInt(100000, 1000000));
  const res = await zaloOtpProvider.send({
    target: phone,
    code,
    purpose: "ACTIVATION",
    minutesValid: 5,
  });

  await writeAudit({
    actor: {
      id: session.user.id,
      name: session.user.name ?? session.user.email ?? session.user.id,
    },
    module: "integrations",
    entityType: "ZaloZnsTest",
    entityId: phone,
    action: "SEND_TEST",
    newValues: { phone, live, ok: res.ok, error: res.error ?? null },
    reason: "Smoke ZNS mẫu Xác thực trước khi mở cho phụ huynh thật",
  });

  revalidatePath("/admin/tich-hop");
  if (!res.ok) return { ok: false, error: res.error ?? "Gửi thất bại", live };
  return {
    ok: true,
    live,
    detail: live
      ? `Đã gửi ZNS THẬT tới ${formatPhoneVN(phone)} — mã trong tin phải là ${code}`
      : `ZALO_LIVE chưa bật ở môi trường này nên chỉ MÔ PHỎNG, không có tin nào được gửi (mã giả lập ${code})`,
  };
}

// Commit 4 — cấu hình tài khoản nhận tiền (VietQR). KHÔNG hardcode số tài khoản.
const vietqrSchema = z.object({
  bankBin: z.string().trim().regex(/^\d{6}$/, "Mã ngân hàng (BIN) gồm 6 chữ số"),
  accountNumber: z.string().trim().min(6, "Số tài khoản không hợp lệ").max(30),
  accountName: z.string().trim().min(2, "Tên chủ TK quá ngắn").max(120),
});

export async function setVietQrConfig(input: unknown): Promise<{ ok: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Chưa đăng nhập" };
  if (!(await checkPermission("settings:edit"))) return { ok: false, error: "Không có quyền" };

  const parsed = vietqrSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" };

  await setPaymentConfig(parsed.data);
  revalidatePath("/admin/tich-hop");
  return { ok: true };
}
