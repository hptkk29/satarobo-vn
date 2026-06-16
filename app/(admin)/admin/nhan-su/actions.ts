"use server";

import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { assertCan, hasRole } from "@/lib/auth/permissions";
import { writeAudit } from "@/lib/audit/audit-log";
import {
  employeeCreateSchema,
  employeeUpdateSchema,
} from "@/lib/validators/employee";

type ActionResult<T = unknown> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

// ─── Nhân viên HO (Hội sở) ──────────────────────────────────────────────
// HO là OrgUnit type=HO (Doc 15 OI-1), KHÔNG phải Center. NV "thuộc HO" khi có
// EmployeeOrgAssignment PRIMARY active tới OrgUnit HO. Bật cờ ⇒ upsert assignment;
// tắt ⇒ EXPIRE assignment. assignment KHÔNG sinh quyền (quyền chỉ từ UserOrgRole).
async function getHoUnitId(): Promise<string | null> {
  const ho = await db.orgUnit.findFirst({
    where: { type: "HO", deletedAt: null },
    select: { id: true },
  });
  return ho?.id ?? null;
}

async function syncHoAssignment(
  actor: { id: string | null; name: string },
  employeeId: string,
  isHO: boolean,
): Promise<void> {
  const hoUnitId = await getHoUnitId();
  if (!hoUnitId) return; // không có OrgUnit HO → bỏ qua (pre-check đã chặn khi bật)

  if (isHO) {
    const existing = await db.employeeOrgAssignment.findFirst({
      where: { employeeId, orgUnitId: hoUnitId, status: "ACTIVE" },
      select: { id: true },
    });
    if (existing) return; // idempotent
    const created = await db.employeeOrgAssignment.create({
      data: {
        employeeId,
        orgUnitId: hoUnitId,
        assignmentType: "PRIMARY",
        createdById: actor.id ?? "system",
      },
    });
    await writeAudit({
      actor,
      module: "employees",
      entityType: "EmployeeOrgAssignment",
      entityId: created.id,
      action: "CREATE",
      newValues: { orgUnitId: hoUnitId, assignmentType: "PRIMARY" },
      reason: "HR form: gán Nhân viên HO (Hội sở)",
      orgUnitId: hoUnitId,
    });
  } else {
    const actives = await db.employeeOrgAssignment.findMany({
      where: { employeeId, orgUnitId: hoUnitId, status: "ACTIVE" },
      select: { id: true },
    });
    if (actives.length === 0) return;
    await db.employeeOrgAssignment.updateMany({
      where: { employeeId, orgUnitId: hoUnitId, status: "ACTIVE" },
      data: { status: "EXPIRED", effectiveTo: new Date() },
    });
    await writeAudit({
      actor,
      module: "employees",
      entityType: "EmployeeOrgAssignment",
      entityId: actives[0]!.id,
      action: "UPDATE",
      newValues: { status: "EXPIRED" },
      reason: "HR form: bỏ Nhân viên HO (Hội sở)",
      orgUnitId: hoUnitId,
    });
  }
}

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
  isHO = false,
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

  // Bật cờ HO nhưng chưa seed OrgUnit HO → chặn sớm, tránh tạo NV "mồ côi" cơ sở.
  if (isHO && !(await getHoUnitId())) {
    return {
      ok: false,
      error:
        "Chưa có đơn vị Hội sở (HO) trong hệ thống. Liên hệ quản trị để seed OrgUnit trước.",
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

  // NV HO → không gán Center (centerId null); chỗ làm xác định qua assignment HO.
  const createData = { ...parsed.data };
  if (isHO) createData.centerId = null;

  const created = await db.employee.create({
    data: {
      ...createData,
      createdById: session.user.id,
    },
  });

  await syncHoAssignment(
    { id: session.user.id ?? null, name: session.user.name ?? session.user.email ?? "Unknown" },
    created.id,
    isHO,
  );

  revalidateAll();
  return { ok: true, data: { id: created.id } };
}

export async function updateEmployeeAction(
  id: string,
  input: unknown,
  isHO?: boolean,
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

  if (isHO === true && !(await getHoUnitId())) {
    return {
      ok: false,
      error:
        "Chưa có đơn vị Hội sở (HO) trong hệ thống. Liên hệ quản trị để seed OrgUnit trước.",
    };
  }

  // CENTER_MANAGER role không được edit salary fields
  const data = { ...parsed.data };
  if (hasRole(session.user, "CENTER_MANAGER") && !hasRole(session.user, "SUPER_ADMIN")) {
    delete data.salaryRank;
    delete data.salaryLevel;
  }
  // NV HO → không gán Center.
  if (isHO === true) data.centerId = null;

  if (data.isCEO) {
    await db.employee.updateMany({
      where: { isCEO: true, NOT: { id } },
      data: { isCEO: false },
    });
  }

  await db.employee.update({ where: { id }, data });

  if (typeof isHO === "boolean") {
    await syncHoAssignment(
      { id: session.user.id ?? null, name: session.user.name ?? session.user.email ?? "Unknown" },
      id,
      isHO,
    );
  }

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

// Đợt 3B — gán NHIỀU vai trò + 1 vai trò chính (primary). PARENT loại khỏi
// VALID_ROLES (chỉ staff) nên không thể trộn PARENT với staff ở đây.
const changeRoleSchema = z
  .object({
    employeeId: z.string().min(1),
    roles: z.array(z.enum(VALID_ROLES)).min(1, "Chọn ít nhất 1 vai trò"),
    primaryRole: z.enum(VALID_ROLES),
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
