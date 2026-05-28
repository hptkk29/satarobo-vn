"use server";

import bcrypt from "bcryptjs";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

// =============================================================================
// PORTAL PROFILE — Phase NHÓM 3
// Phụ huynh tự sửa tên hiển thị + đổi mật khẩu. Không bump tokenVersion để
// không tự đăng xuất giữa chừng.
// =============================================================================

async function requireParent() {
  const session = await auth();
  if (!session?.user || session.user.role !== "PARENT") return null;
  return session.user;
}

const nameSchema = z.string().trim().min(2, "Tên quá ngắn").max(120);

export async function updateParentName(
  name: string,
): Promise<{ ok: boolean; error?: string }> {
  const user = await requireParent();
  if (!user) return { ok: false, error: "Chưa đăng nhập" };

  const parsed = nameSchema.safeParse(name);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Tên không hợp lệ" };
  }

  await db.user.update({ where: { id: user.id }, data: { name: parsed.data } });
  revalidatePath("/portal/ho-so");
  revalidatePath("/portal");
  return { ok: true };
}

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, "Nhập mật khẩu hiện tại"),
    newPassword: z.string().min(8, "Mật khẩu mới tối thiểu 8 ký tự"),
    confirmPassword: z.string(),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: "Xác nhận mật khẩu không khớp",
    path: ["confirmPassword"],
  });

export async function changeParentPassword(input: {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}): Promise<{ ok: boolean; error?: string }> {
  const user = await requireParent();
  if (!user) return { ok: false, error: "Chưa đăng nhập" };

  const parsed = passwordSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" };
  }

  const row = await db.user.findUnique({
    where: { id: user.id },
    select: { password: true },
  });
  if (!row?.password) return { ok: false, error: "Tài khoản không hợp lệ" };

  const valid = await bcrypt.compare(parsed.data.currentPassword, row.password);
  if (!valid) return { ok: false, error: "Mật khẩu hiện tại không đúng" };

  const hashed = await bcrypt.hash(parsed.data.newPassword, 10);
  await db.user.update({ where: { id: user.id }, data: { password: hashed } });
  return { ok: true };
}
