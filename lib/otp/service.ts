import "server-only";
import { createHmac, randomInt, timingSafeEqual } from "crypto";
import { db } from "@/lib/db";
import { getPrimaryOtpProvider } from "./provider";
import { getSetting } from "@/lib/settings/service";
import { getSigningSecret } from "@/lib/security/signing-key";

// =============================================================================
// Cụm A1 — OTP service (request + verify).
// Quy tắc: hết hạn 5 phút · tối đa 5 lần thử · cooldown gửi lại 60s · giới hạn
// theo ngày/email. CHỈ dùng cho kích hoạt / quên mật khẩu / đổi liên hệ — KHÔNG
// dùng cho mọi lần login. Code lưu DẠNG HASH (HMAC-SHA256).
// =============================================================================

export const OTP_TTL_MINUTES = 5;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_RESEND_COOLDOWN_SEC = 60;
export const OTP_DAILY_LIMIT = 8; // tối đa số OTP / target / ngày

export type OtpPurposeKey = "ACTIVATION" | "RESET" | "CHANGE_CONTACT";

function secret(): string {
  return getSigningSecret(); // SEC-H05: bỏ fallback hằng số công khai (brute-force OTP hash).
}

function hashCode(code: string): string {
  return createHmac("sha256", secret()).update(code).digest("hex");
}

function safeEqualHex(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

function genCode(): string {
  // 6 chữ số, không bắt đầu bằng 0 để luôn đủ 6 ký tự.
  return String(randomInt(100000, 1000000));
}

const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

export type RequestOtpResult =
  | { ok: true; otpId: string; expiresAt: Date; cooldownSec: number }
  | {
      ok: false;
      error: string;
      cooldownSec?: number;
      /** OTP ĐÃ tạo (verify được) nhưng kênh gửi lỗi — caller quyết định cách báo (QA 21/07 #3). */
      deliveryFailed?: boolean;
    };

/**
 * Tạo + gửi OTP. Áp cooldown 60s + giới hạn ngày. Trả về otpId + hạn.
 */
export async function requestOtp(input: {
  target: string;
  purpose: OtpPurposeKey;
  userId?: string | null;
}): Promise<RequestOtpResult> {
  const target = input.target.trim().toLowerCase();
  if (!target) return { ok: false, error: "Thiếu email/SĐT" };

  // Tham số động (SystemSetting "otp.*"); default = hằng số cũ nếu chưa cấu hình.
  const [ttlMinutes, cooldownSec, dailyLimit, maxAttempts] = await Promise.all([
    getSetting("otp.ttlMinutes"),
    getSetting("otp.resendCooldownSec"),
    getSetting("otp.dailyLimit"),
    getSetting("otp.maxAttempts"),
  ]);

  // Cooldown: lần gửi gần nhất < cooldownSec.
  const last = await db.otpRequest.findFirst({
    where: { target, purpose: input.purpose },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  if (last) {
    const elapsed = (Date.now() - last.createdAt.getTime()) / 1000;
    if (elapsed < cooldownSec) {
      return {
        ok: false,
        error: `Vui lòng chờ ${Math.ceil(cooldownSec - elapsed)}s trước khi gửi lại.`,
        cooldownSec: Math.ceil(cooldownSec - elapsed),
      };
    }
  }

  // Giới hạn theo ngày.
  const todayCount = await db.otpRequest.count({
    where: { target, purpose: input.purpose, createdAt: { gte: startOfToday() } },
  });
  if (todayCount >= dailyLimit) {
    return { ok: false, error: "Đã vượt số lần gửi mã trong ngày. Vui lòng thử lại sau." };
  }

  const code = genCode();
  const expiresAt = new Date(Date.now() + ttlMinutes * 60_000);
  const provider = getPrimaryOtpProvider();

  const otp = await db.otpRequest.create({
    data: {
      target,
      channel: provider.channel,
      purpose: input.purpose,
      codeHash: hashCode(code),
      expiresAt,
      maxAttempts,
      userId: input.userId ?? null,
    },
    select: { id: true },
  });

  const sent = await provider.send({
    target,
    code,
    purpose: input.purpose,
    minutesValid: ttlMinutes,
  });

  await db.otpDeliveryLog.create({
    data: {
      otpRequestId: otp.id,
      channel: provider.channel,
      target,
      provider: provider.name,
      status: sent.ok ? "SENT" : "FAILED",
      error: sent.error ?? null,
    },
  });

  if (!sent.ok) {
    return {
      ok: false,
      error: sent.error ?? "Không gửi được mã. Thử lại sau.",
      deliveryFailed: true,
    };
  }

  return { ok: true, otpId: otp.id, expiresAt, cooldownSec };
}

export type VerifyOtpResult =
  | { ok: true; otpId: string; userId: string | null }
  | { ok: false; error: string; attemptsLeft?: number };

/**
 * Verify OTP mới nhất chưa dùng cho target+purpose. Tăng attempts; khoá sau 5 lần.
 * Thành công → set verifiedAt (chưa consume — nghiệp vụ gọi consumeOtp sau).
 */
export async function verifyOtp(input: {
  target: string;
  purpose: OtpPurposeKey;
  code: string;
}): Promise<VerifyOtpResult> {
  const target = input.target.trim().toLowerCase();
  const code = input.code.trim();

  const otp = await db.otpRequest.findFirst({
    where: { target, purpose: input.purpose, consumedAt: null },
    orderBy: { createdAt: "desc" },
  });
  if (!otp) return { ok: false, error: "Chưa có mã hoặc mã đã dùng. Vui lòng gửi lại." };
  if (otp.verifiedAt) return { ok: true, otpId: otp.id, userId: otp.userId };

  if (otp.expiresAt.getTime() < Date.now()) {
    return { ok: false, error: "Mã đã hết hạn. Vui lòng gửi lại." };
  }
  if (otp.attempts >= otp.maxAttempts) {
    return { ok: false, error: "Đã nhập sai quá số lần cho phép. Vui lòng gửi mã mới." };
  }

  const match = safeEqualHex(otp.codeHash, hashCode(code));
  if (!match) {
    const updated = await db.otpRequest.update({
      where: { id: otp.id },
      data: { attempts: { increment: 1 } },
      select: { attempts: true, maxAttempts: true },
    });
    const left = Math.max(0, updated.maxAttempts - updated.attempts);
    return {
      ok: false,
      error: left > 0 ? `Mã không đúng. Còn ${left} lần thử.` : "Đã khoá — vui lòng gửi mã mới.",
      attemptsLeft: left,
    };
  }

  await db.otpRequest.update({ where: { id: otp.id }, data: { verifiedAt: new Date() } });
  return { ok: true, otpId: otp.id, userId: otp.userId };
}

/** Đánh dấu OTP đã dùng xong (sau khi hoàn tất nghiệp vụ). */
export async function consumeOtp(otpId: string): Promise<void> {
  await db.otpRequest.update({ where: { id: otpId }, data: { consumedAt: new Date() } }).catch(() => {});
}
