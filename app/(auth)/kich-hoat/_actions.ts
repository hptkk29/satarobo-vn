"use server";

import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "@/lib/db";
import { requestOtp, verifyOtp, consumeOtp } from "@/lib/otp/service";
import { logUserAudit } from "@/lib/audit/log";

// Cụm A1 — kích hoạt tài khoản phụ huynh qua OTP email. Public (chưa đăng nhập).

type Result = { ok: boolean; error?: string; cooldownSec?: number };

const emailSchema = z.string().trim().toLowerCase().email("Email không hợp lệ");

/** Bước 1 — gửi OTP kích hoạt tới email tài khoản PENDING_ACTIVATION. */
export async function requestActivationOtp(rawEmail: string): Promise<Result> {
  const parsed = emailSchema.safeParse(rawEmail);
  if (!parsed.success) return { ok: false, error: "Email không hợp lệ" };
  const email = parsed.data;

  const user = await db.user.findUnique({
    where: { email },
    select: { id: true, accountStatus: true, deletedAt: true },
  });

  // Đã kích hoạt → hướng dẫn đăng nhập (không reset mật khẩu).
  if (user && user.accountStatus === "ACTIVE") {
    return { ok: false, error: "Tài khoản đã kích hoạt — vui lòng đăng nhập bằng mật khẩu." };
  }
  // Không tồn tại / đã xoá → trả generic để tránh dò email; không gửi gì.
  if (!user || user.deletedAt || user.accountStatus !== "PENDING_ACTIVATION") {
    return { ok: true }; // im lặng: "nếu email hợp lệ, mã đã được gửi"
  }

  const res = await requestOtp({ target: email, purpose: "ACTIVATION", userId: user.id });
  if (!res.ok) return { ok: false, error: res.error, cooldownSec: res.cooldownSec };

  await logUserAudit({
    userId: user.id,
    action: "UPDATE",
    actorId: null,
    actorName: "Hệ thống (OTP)",
    changedFields: ["otpActivation"],
    reason: "Gửi OTP kích hoạt tài khoản",
  }).catch(() => {});

  return { ok: true, cooldownSec: res.cooldownSec };
}

const activateSchema = z.object({
  email: emailSchema,
  code: z.string().trim().regex(/^\d{6}$/, "Mã gồm 6 chữ số"),
  password: z.string().min(8, "Mật khẩu tối thiểu 8 ký tự"),
});

/** Bước 2 — verify OTP + đặt mật khẩu → ACTIVE. */
export async function activateAccount(input: unknown): Promise<Result> {
  const parsed = activateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" };
  const { email, code, password } = parsed.data;

  const v = await verifyOtp({ target: email, purpose: "ACTIVATION", code });
  if (!v.ok) return { ok: false, error: v.error };

  const user = await db.user.findUnique({
    where: { email },
    select: { id: true, accountStatus: true },
  });
  if (!user) return { ok: false, error: "Không tìm thấy tài khoản" };
  // Phụ huynh đã ACTIVE → KHÔNG đặt lại mật khẩu.
  if (user.accountStatus !== "PENDING_ACTIVATION") {
    return { ok: false, error: "Tài khoản đã kích hoạt — vui lòng đăng nhập." };
  }

  const hashed = await bcrypt.hash(password, 10);
  await db.user.update({
    where: { id: user.id },
    data: { password: hashed, accountStatus: "ACTIVE", isActive: true, emailVerified: new Date() },
  });
  await consumeOtp(v.otpId);

  await logUserAudit({
    userId: user.id,
    action: "ENABLE",
    actorId: user.id,
    actorName: "Phụ huynh (kích hoạt)",
    changedFields: ["accountStatus", "password"],
    reason: "Kích hoạt tài khoản phụ huynh qua OTP email",
  }).catch(() => {});

  return { ok: true };
}
