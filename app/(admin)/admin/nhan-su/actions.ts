"use server";

import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { assertCan, hasRole } from "@/lib/auth/permissions";
import {
  employeeCreateSchema,
  employeeUpdateSchema,
} from "@/lib/validators/employee";

type ActionResult<T = unknown> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

function revalidateAll() {
  revalidatePath("/nhan-su");
  revalidatePath("/vinh-danh");
  revalidatePath("/vinh-danh/tat-ca");
  revalidatePath("/vinh-danh/spark");
  revalidatePath("/vinh-danh/growth");
  revalidatePath("/vinh-danh/impact");
  revalidatePath("/vinh-danh/grand-champion");
  revalidatePath("/ve-chung-toi");
}

export async function createEmployeeAction(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Chưa đăng nhập" };
  try {
    assertCan(session.user, "employees:create");
  } catch {
    return { ok: false, error: "Không có quyền" };
  }

  const parsed = employeeCreateSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
    };
  }

  const existing = await db.employee.findUnique({
    where: { employeeCode: parsed.data.employeeCode },
  });
  if (existing) {
    return { ok: false, error: "Mã nhân viên đã tồn tại" };
  }

  if (parsed.data.email) {
    const existingEmail = await db.employee.findUnique({
      where: { email: parsed.data.email },
    });
    if (existingEmail) {
      return { ok: false, error: "Email đã tồn tại" };
    }
  }

  // Ensure chỉ 1 CEO
  if (parsed.data.isCEO) {
    await db.employee.updateMany({
      where: { isCEO: true },
      data: { isCEO: false },
    });
  }

  const created = await db.employee.create({
    data: {
      ...parsed.data,
      createdById: session.user.id,
    },
  });

  revalidateAll();
  return { ok: true, data: { id: created.id } };
}

export async function updateEmployeeAction(
  id: string,
  input: unknown,
): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Chưa đăng nhập" };
  try {
    assertCan(session.user, "employees:edit");
  } catch {
    return { ok: false, error: "Không có quyền" };
  }

  const parsed = employeeUpdateSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
    };
  }

  // CENTER_MANAGER role không được edit salary fields
  const data = { ...parsed.data };
  if (hasRole(session.user, "CENTER_MANAGER") && !hasRole(session.user, "SUPER_ADMIN")) {
    delete data.salaryRank;
    delete data.salaryLevel;
  }

  if (data.isCEO) {
    await db.employee.updateMany({
      where: { isCEO: true, NOT: { id } },
      data: { isCEO: false },
    });
  }

  await db.employee.update({ where: { id }, data });
  revalidateAll();
  return { ok: true };
}

export async function deleteEmployeeAction(id: string): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Chưa đăng nhập" };
  try {
    assertCan(session.user, "employees:delete");
  } catch {
    return { ok: false, error: "Không có quyền" };
  }

  // Check xem có Honor đang link không
  const honorCount = await db.honor.count({ where: { employeeId: id } });
  if (honorCount > 0) {
    return {
      ok: false,
      error: `Không thể xoá: nhân sự này có ${honorCount} honor records. Xoá honors trước.`,
    };
  }

  await db.employee.delete({ where: { id } });
  revalidateAll();
  return { ok: true };
}

export async function toggleEmployeeActiveAction(id: string): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Chưa đăng nhập" };
  try {
    assertCan(session.user, "employees:edit");
  } catch {
    return { ok: false, error: "Không có quyền" };
  }

  const emp = await db.employee.findUnique({ where: { id } });
  if (!emp) return { ok: false, error: "Không tìm thấy" };
  await db.employee.update({
    where: { id },
    data: { isActive: !emp.isActive },
  });
  revalidateAll();
  return { ok: true };
}

export async function toggleEmployeePublicAction(id: string): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Chưa đăng nhập" };
  try {
    assertCan(session.user, "employees:edit");
  } catch {
    return { ok: false, error: "Không có quyền" };
  }

  const emp = await db.employee.findUnique({ where: { id } });
  if (!emp) return { ok: false, error: "Không tìm thấy" };
  await db.employee.update({
    where: { id },
    data: { isPublic: !emp.isPublic },
  });
  revalidateAll();
  return { ok: true };
}

// ─── Role change (audit-logged) ─────────────────────────────────────────
// "Role" here = the auth Role on the Employee's linked User account.
// Employees without a linked User account cannot have their role changed
// from this UI (there's nothing to update). SUPER_ADMIN only.

const VALID_ROLES = [
  "SUPER_ADMIN",
  "CENTER_MANAGER",
  "HR",
  "SALES_CSM",
  "TEACHER",
  "MARKETING",
  "ACCOUNTANT",
] as const;
type ValidRole = (typeof VALID_ROLES)[number];

const changeRoleSchema = z.object({
  employeeId: z.string().min(1),
  newRole: z.enum(VALID_ROLES),
  reason: z.string().trim().min(5, "Lý do phải có ít nhất 5 ký tự").max(500),
});

export async function changeEmployeeRoleAction(input: {
  employeeId: string;
  newRole: ValidRole;
  reason: string;
}): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Chưa đăng nhập" };
  if (!hasRole(session.user, "SUPER_ADMIN")) {
    return { ok: false, error: "Chỉ SUPER_ADMIN mới được thay đổi vai trò" };
  }

  const parsed = changeRoleSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
    };
  }

  const employee = await db.employee.findUnique({
    where: { id: parsed.data.employeeId },
    select: {
      id: true,
      fullName: true,
      userAccount: { select: { id: true, role: true } },
    },
  });
  if (!employee) return { ok: false, error: "Không tìm thấy nhân viên" };
  if (!employee.userAccount) {
    return {
      ok: false,
      error:
        "Nhân viên chưa có User account — không có vai trò để đổi. Tạo User cho NV này trước.",
    };
  }

  // Chống tự khoá: không được đổi vai trò CHÍNH tài khoản mình (vd tự hạ xuống
  // TEACHER → mất quyền admin ngay request kế tiếp).
  if (employee.userAccount.id === session.user.id) {
    return {
      ok: false,
      error: "Không thể tự đổi vai trò của chính mình (tránh tự khoá quyền).",
    };
  }

  const fromRole = employee.userAccount.role;
  if (fromRole === parsed.data.newRole) {
    return { ok: false, error: "Vai trò không thay đổi" };
  }

  try {
    await db.$transaction([
      db.user.update({
        where: { id: employee.userAccount.id },
        // Bump tokenVersion → JWT cũ (mang role cũ) bị vô hiệu ngay request kế
        // tiếp (admin layout check tokenVersion mismatch → buộc re-login), nên
        // vai trò mới có hiệu lực NGAY, không phải chờ token hết hạn ~30 ngày.
        data: { role: parsed.data.newRole, tokenVersion: { increment: 1 } },
      }),
      db.roleAuditLog.create({
        data: {
          employeeId: employee.id,
          fromRole,
          toRole: parsed.data.newRole,
          changedByUserId: session.user.id ?? null,
          changedByName: session.user.name ?? session.user.email ?? "Unknown",
          reason: parsed.data.reason,
        },
      }),
    ]);
  } catch (err) {
    return {
      ok: false,
      error: `Lỗi DB: ${err instanceof Error ? err.message : "Unknown"}`,
    };
  }

  revalidateAll();
  revalidatePath(`/nhan-su/${employee.id}/edit`);
  return { ok: true };
}
