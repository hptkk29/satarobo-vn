"use server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { assertCan } from "@/lib/auth/permissions";
import {
  employeeCreateSchema,
  employeeUpdateSchema,
} from "@/lib/validators/employee";

type ActionResult<T = unknown> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

function revalidateAll() {
  revalidatePath("/admin/nhan-su");
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
    assertCan(session.user.role, "employees:create");
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
    assertCan(session.user.role, "employees:edit");
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

  // MANAGER role không được edit salary fields
  const data = { ...parsed.data };
  if (session.user.role === "MANAGER") {
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
    assertCan(session.user.role, "employees:delete");
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
    assertCan(session.user.role, "employees:edit");
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
    assertCan(session.user.role, "employees:edit");
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
