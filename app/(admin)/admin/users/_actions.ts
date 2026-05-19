"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { auth } from "@/lib/auth";
import { can } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import {
  userCreateSchema,
  userUpdateSchema,
  passwordResetSchema,
} from "@/lib/validators/user";

async function requireUsersManage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!can(session.user, "users:manage")) {
    redirect("/admin/dashboard?error=unauthorized");
  }
  return session.user;
}

// ─── CREATE ──────────────────────────────────────────────────────────
export async function createUserAction(formData: FormData) {
  await requireUsersManage();

  const parsed = userCreateSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
    role: formData.get("role"),
    centerId: formData.get("centerId") || null,
    employeeId: formData.get("employeeId") || null,
  });

  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
    };
  }

  // Email unique
  const existing = await db.user.findUnique({
    where: { email: parsed.data.email },
    select: { id: true },
  });
  if (existing) {
    return { ok: false, error: "Email đã được sử dụng" };
  }

  // Employee chưa link User khác
  if (parsed.data.employeeId) {
    const empUsed = await db.user.findFirst({
      where: { employeeId: parsed.data.employeeId },
      select: { id: true },
    });
    if (empUsed) {
      return { ok: false, error: "Nhân sự này đã có tài khoản đăng nhập" };
    }
  }

  const hashed = await bcrypt.hash(parsed.data.password, 10);

  const user = await db.user.create({
    data: {
      name: parsed.data.name,
      email: parsed.data.email,
      password: hashed,
      role: parsed.data.role,
      centerId: parsed.data.centerId ?? null,
      employeeId: parsed.data.employeeId ?? null,
      isActive: true,
      tokenVersion: 0,
    },
    select: { id: true },
  });

  revalidatePath("/admin/users");
  return { ok: true as const, id: user.id };
}

// ─── UPDATE ──────────────────────────────────────────────────────────
export async function updateUserAction(id: string, formData: FormData) {
  const me = await requireUsersManage();

  const parsed = userUpdateSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    role: formData.get("role"),
    centerId: formData.get("centerId") || null,
    employeeId: formData.get("employeeId") || null,
  });

  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
    };
  }

  const current = await db.user.findUnique({
    where: { id },
    select: { id: true, email: true, role: true, employeeId: true },
  });
  if (!current) return { ok: false, error: "Không tìm thấy user" };

  // Self-protection: không cho self-demote role
  if (id === me.id && parsed.data.role !== current.role) {
    return { ok: false, error: "Không thể tự đổi role của chính mình" };
  }

  // Last SUPER_ADMIN protection
  if (current.role === "SUPER_ADMIN" && parsed.data.role !== "SUPER_ADMIN") {
    const remaining = await db.user.count({
      where: {
        role: "SUPER_ADMIN",
        isActive: true,
        deletedAt: null,
        id: { not: id },
      },
    });
    if (remaining === 0) {
      return {
        ok: false,
        error: "Không thể demote SUPER_ADMIN duy nhất của hệ thống",
      };
    }
  }

  // Email unique nếu thay đổi
  if (parsed.data.email !== current.email) {
    const existing = await db.user.findUnique({
      where: { email: parsed.data.email },
      select: { id: true },
    });
    if (existing && existing.id !== id) {
      return { ok: false, error: "Email đã được sử dụng" };
    }
  }

  // Employee link nếu thay đổi
  if (parsed.data.employeeId && parsed.data.employeeId !== current.employeeId) {
    const empUsed = await db.user.findFirst({
      where: { employeeId: parsed.data.employeeId, id: { not: id } },
      select: { id: true },
    });
    if (empUsed) {
      return { ok: false, error: "Nhân sự này đã có tài khoản đăng nhập khác" };
    }
  }

  // Increment tokenVersion nếu role thay đổi → force re-login
  const roleChanged = parsed.data.role !== current.role;

  await db.user.update({
    where: { id },
    data: {
      name: parsed.data.name,
      email: parsed.data.email,
      role: parsed.data.role,
      centerId: parsed.data.centerId ?? null,
      employeeId: parsed.data.employeeId ?? null,
      ...(roleChanged && { tokenVersion: { increment: 1 } }),
    },
  });

  revalidatePath("/admin/users");
  revalidatePath(`/admin/users/${id}/edit`);
  return { ok: true as const };
}

// ─── TOGGLE ACTIVE ───────────────────────────────────────────────────
export async function toggleUserActiveAction(id: string) {
  const me = await requireUsersManage();

  if (id === me.id) {
    return { ok: false, error: "Không thể tự disable chính mình" };
  }

  const user = await db.user.findUnique({
    where: { id },
    select: { isActive: true, role: true },
  });
  if (!user) return { ok: false, error: "Không tìm thấy user" };

  // Last SUPER_ADMIN check (chỉ áp dụng khi đang active + đi disable)
  if (user.role === "SUPER_ADMIN" && user.isActive) {
    const remaining = await db.user.count({
      where: {
        role: "SUPER_ADMIN",
        isActive: true,
        deletedAt: null,
        id: { not: id },
      },
    });
    if (remaining === 0) {
      return { ok: false, error: "Không thể disable SUPER_ADMIN duy nhất" };
    }
  }

  await db.user.update({
    where: { id },
    data: {
      isActive: !user.isActive,
      tokenVersion: { increment: 1 }, // force logout
    },
  });

  revalidatePath("/admin/users");
  return { ok: true as const };
}

// ─── RESET PASSWORD ──────────────────────────────────────────────────
export async function resetUserPasswordAction(id: string, formData: FormData) {
  await requireUsersManage();

  const parsed = passwordResetSchema.safeParse({
    newPassword: formData.get("newPassword"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Mật khẩu không hợp lệ",
    };
  }

  const user = await db.user.findUnique({ where: { id }, select: { id: true } });
  if (!user) return { ok: false, error: "Không tìm thấy user" };

  const hashed = await bcrypt.hash(parsed.data.newPassword, 10);

  await db.user.update({
    where: { id },
    data: {
      password: hashed,
      tokenVersion: { increment: 1 }, // force logout
    },
  });

  revalidatePath("/admin/users");
  return { ok: true as const };
}
