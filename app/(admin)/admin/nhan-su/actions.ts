"use server";

import { z } from "zod";
import type { Role } from "@prisma/client";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { assertCan, hasRole } from "@/lib/auth/permissions";
import { ASSIGNABLE_ROLES } from "@/lib/labels";
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

// Vai trò gán được = ASSIGNABLE_ROLES (lib/labels) — loại PARENT (chỉ staff).
// z.enum cần tuple literal nên ép kiểu Role[] -> [Role, ...Role[]] (chỉ thu hẹp,
// runtime vẫn chặn giá trị ngoài danh sách 7 vai trò).
const roleEnum = z.enum(ASSIGNABLE_ROLES as [Role, ...Role[]]);
type ValidRole = z.infer<typeof roleEnum>;

// Đợt 3B — gán NHIỀU vai trò + 1 vai trò chính (primary). PARENT loại khỏi
// ASSIGNABLE_ROLES (chỉ staff) nên không thể trộn PARENT với staff ở đây.
const changeRoleSchema = z
  .object({
    employeeId: z.string().min(1),
    roles: z.array(roleEnum).min(1, "Chọn ít nhất 1 vai trò"),
    primaryRole: roleEnum,
    reason: z.string().trim().min(5, "Lý do phải có ít nhất 5 ký tự").max(500),
  })
  .refine((d) => d.roles.includes(d.primaryRole), {
    message: "Vai trò chính phải nằm trong danh sách vai trò đã chọn",
    path: ["primaryRole"],
  });

export async function changeEmployeeRoleAction(input: {
  employeeId: string;
  roles: ValidRole[];
  primaryRole: ValidRole;
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
  const roles = [...new Set(parsed.data.roles)] as ValidRole[];
  const primaryRole = parsed.data.primaryRole;

  const employee = await db.employee.findUnique({
    where: { id: parsed.data.employeeId },
    select: {
      id: true,
      fullName: true,
      userAccount: { select: { id: true, role: true, roles: true } },
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

  // Chống tự khoá: không được đổi vai trò CHÍNH tài khoản mình.
  if (employee.userAccount.id === session.user.id) {
    return {
      ok: false,
      error: "Không thể tự đổi vai trò của chính mình (tránh tự khoá quyền).",
    };
  }

  const fromRole = employee.userAccount.role;
  const sameRoles =
    fromRole === primaryRole &&
    [...employee.userAccount.roles].sort().join(",") === [...roles].sort().join(",");
  if (sameRoles) {
    return { ok: false, error: "Vai trò không thay đổi" };
  }

  try {
    await db.$transaction([
      db.user.update({
        where: { id: employee.userAccount.id },
        // Bump tokenVersion → token cũ vô hiệu ngay request kế (buộc re-login để
        // mang roles mới). role = vai trò chính; roles = union.
        data: { role: primaryRole, roles, tokenVersion: { increment: 1 } },
      }),
      db.roleAuditLog.create({
        data: {
          employeeId: employee.id,
          fromRole,
          toRole: primaryRole,
          changedByUserId: session.user.id ?? null,
          changedByName: session.user.name ?? session.user.email ?? "Unknown",
          reason: `${parsed.data.reason} · vai trò: [${roles.join(", ")}] (chính: ${primaryRole})`,
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
