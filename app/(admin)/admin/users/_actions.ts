"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { auth } from "@/lib/auth";
import { can, hasRole, isSuperAdmin } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import {
  userCreateSchema,
  userUpdateSchema,
  passwordResetSchema,
} from "@/lib/validators/user";
import { reassignOpenLeads } from "@/lib/lead/assign";
import {
  logUserAudit,
  detectChangedFields,
  getAuditActor,
} from "@/lib/audit/log";

async function requireUsersManage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!can(session.user, "users:manage")) {
    redirect("/dashboard?error=unauthorized");
  }
  return session;
}

// ─── CREATE ──────────────────────────────────────────────────────────
export async function createUserAction(formData: FormData) {
  const session = await requireUsersManage();

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
  const { actorId, actorName } = getAuditActor(session);

  const user = await db.$transaction(async (tx) => {
    const created = await tx.user.create({
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
      select: {
        id: true,
        email: true,
        role: true,
        centerId: true,
        employeeId: true,
        isActive: true,
      },
    });

    await logUserAudit({
      userId: created.id,
      action: "CREATE",
      actorId,
      actorName,
      newValues: {
        email: created.email,
        role: created.role,
        centerId: created.centerId,
        employeeId: created.employeeId,
        isActive: created.isActive,
      },
      tx,
    });

    return created;
  });

  revalidatePath("/users");
  return { ok: true as const, id: user.id };
}

// ─── UPDATE ──────────────────────────────────────────────────────────
export async function updateUserAction(id: string, formData: FormData) {
  const session = await requireUsersManage();
  const me = session.user;

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
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      centerId: true,
      employeeId: true,
    },
  });
  if (!current) return { ok: false, error: "Không tìm thấy user" };

  // Self-protection: không cho self-demote role
  if (id === me.id && parsed.data.role !== current.role) {
    return { ok: false, error: "Không thể tự đổi role của chính mình" };
  }

  // Last SUPER_ADMIN protection
  if (isSuperAdmin(current.role) && !isSuperAdmin(parsed.data.role)) {
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
  const { actorId, actorName } = getAuditActor(session);

  await db.$transaction(async (tx) => {
    const updated = await tx.user.update({
      where: { id },
      data: {
        name: parsed.data.name,
        email: parsed.data.email,
        role: parsed.data.role,
        centerId: parsed.data.centerId ?? null,
        employeeId: parsed.data.employeeId ?? null,
        ...(roleChanged && { tokenVersion: { increment: 1 } }),
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        centerId: true,
        employeeId: true,
      },
    });

    const oldValues = {
      name: current.name,
      email: current.email,
      role: current.role,
      centerId: current.centerId,
      employeeId: current.employeeId,
    };
    const newValues = {
      name: updated.name,
      email: updated.email,
      role: updated.role,
      centerId: updated.centerId,
      employeeId: updated.employeeId,
    };

    await logUserAudit({
      userId: id,
      action: roleChanged ? "ROLE_CHANGE" : "UPDATE",
      actorId,
      actorName,
      oldValues,
      newValues,
      changedFields: detectChangedFields(oldValues, newValues),
      tx,
    });
  });

  revalidatePath("/users");
  revalidatePath(`/users/${id}/edit`);
  return { ok: true as const };
}

// ─── TOGGLE ACTIVE ───────────────────────────────────────────────────
export async function toggleUserActiveAction(id: string) {
  const session = await requireUsersManage();
  const me = session.user;

  if (id === me.id) {
    return { ok: false, error: "Không thể tự disable chính mình" };
  }

  const user = await db.user.findUnique({
    where: { id },
    select: { isActive: true, role: true, roles: true },
  });
  if (!user) return { ok: false, error: "Không tìm thấy user" };
  // Đa vai trò: nhận diện SALES_CSM theo cả role chính lẫn roles[].
  const wasSalesCsm = hasRole(user, "SALES_CSM");

  // Last SUPER_ADMIN check (chỉ áp dụng khi đang active + đi disable)
  if (hasRole(user, "SUPER_ADMIN") && user.isActive) {
    const remaining = await db.user.count({
      where: {
        roles: { has: "SUPER_ADMIN" },
        isActive: true,
        deletedAt: null,
        id: { not: id },
      },
    });
    if (remaining === 0) {
      return { ok: false, error: "Không thể disable SUPER_ADMIN duy nhất" };
    }
  }

  const willBeActive = !user.isActive;
  const { actorId, actorName } = getAuditActor(session);

  // P0-c: bọc try/catch — lỗi DB trả message rõ, không ném stack trace cho client.
  try {
    await db.$transaction(async (tx) => {
      await tx.user.update({
        where: { id },
        data: {
          isActive: willBeActive,
          tokenVersion: { increment: 1 }, // force logout
        },
      });

      await logUserAudit({
        userId: id,
        action: willBeActive ? "ENABLE" : "DISABLE",
        actorId,
        actorName,
        oldValues: { isActive: user.isActive },
        newValues: { isActive: willBeActive },
        changedFields: ["isActive"],
        tx,
      });
    });
  } catch (err) {
    console.error("[toggleUserActive] error:", err);
    return { ok: false, error: "Không cập nhật được trạng thái tài khoản — thử lại" };
  }

  // Phase T1.3 — sale SALES_CSM bị disable → chia lại lead OPEN cho người còn lại.
  // Gọi SAU tx (isActive đã false), best-effort: lỗi chia lead KHÔNG làm hỏng disable.
  if (!willBeActive && wasSalesCsm) {
    await reassignOpenLeads(id, { actorId, actorName }).catch((err) =>
      console.error("[toggleUserActive] reassign leads error:", err),
    );
    revalidatePath("/leads");
  }

  revalidatePath("/users");
  return { ok: true as const };
}

// ─── RESET PASSWORD ──────────────────────────────────────────────────
export async function resetUserPasswordAction(id: string, formData: FormData) {
  const session = await requireUsersManage();

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
  const { actorId, actorName } = getAuditActor(session);

  await db.$transaction(async (tx) => {
    await tx.user.update({
      where: { id },
      data: {
        password: hashed,
        tokenVersion: { increment: 1 }, // force logout
      },
    });

    await logUserAudit({
      userId: id,
      action: "PASSWORD_RESET",
      actorId,
      actorName,
      // KHÔNG log oldValues/newValues — không leak hash
      tx,
    });
  });

  revalidatePath("/users");
  return { ok: true as const };
}
