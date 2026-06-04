"use server";

import { auth } from "@/lib/auth";
import { can } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { classGroupCreateSchema } from "@/lib/validators/class-group";
import { genClassGroupCode } from "@/lib/codegen";

type ActionResult = { error?: string };

async function requireWrite(action: "create" | "edit" | "delete") {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const map = {
    create: "class_group:create",
    edit: "class_group:edit",
    delete: "class_group:delete",
  } as const;
  if (!can(session.user, map[action])) {
    redirect("/dashboard?error=unauthorized");
  }
  return session;
}

function readForm(formData: FormData) {
  const s = (name: string): string | undefined => {
    const v = formData.get(name);
    if (typeof v !== "string") return undefined;
    const t = v.trim();
    return t.length > 0 ? t : undefined;
  };
  return {
    displayCode: s("displayCode") ?? "",
    name: s("name"),
    centerId: s("centerId") ?? "",
    status: s("status") ?? "ACTIVE",
    notes: s("notes"),
  };
}

export async function createClassGroup(
  formData: FormData,
): Promise<ActionResult> {
  await requireWrite("create");

  const parsed = classGroupCreateSchema.safeParse(readForm(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" };
  }
  const data = parsed.data;

  const center = await db.center.findUnique({
    where: { id: data.centerId },
    select: { code: true },
  });
  if (!center) return { error: "Cơ sở không tồn tại" };

  try {
    // Atomic: sinh code + tạo group trong cùng transaction.
    await db.$transaction(async (tx) => {
      const code = await genClassGroupCode(center.code ?? "CS", tx);
      await tx.classGroup.create({
        data: {
          code,
          displayCode: data.displayCode,
          name: data.name,
          centerId: data.centerId,
          status: data.status,
          notes: data.notes,
        },
      });
    });
  } catch {
    return { error: "Lỗi cơ sở dữ liệu — không tạo được nhóm lớp" };
  }

  revalidatePath("/class-groups");
  redirect("/class-groups");
}

export async function updateClassGroup(
  id: string,
  formData: FormData,
): Promise<ActionResult> {
  await requireWrite("edit");

  const parsed = classGroupCreateSchema.safeParse(readForm(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" };
  }
  const data = parsed.data;

  const existing = await db.classGroup.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!existing) return { error: "Nhóm lớp không tồn tại" };

  await db.classGroup.update({
    where: { id },
    data: {
      displayCode: data.displayCode,
      name: data.name,
      centerId: data.centerId,
      status: data.status,
      notes: data.notes,
    },
  });

  revalidatePath("/class-groups");
  revalidatePath(`/class-groups/${id}`);
  redirect("/class-groups");
}

export async function deleteClassGroup(id: string): Promise<ActionResult> {
  await requireWrite("delete");
  await db.classGroup.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
  revalidatePath("/class-groups");
  return {};
}

// ─── P2 — thành viên nhóm (cohort) + gán cả nhóm vào lớp ─────────────
const ENROLL_ACTIVE = ["PENDING", "CONFIRMED", "STUDYING", "ACTIVE"] as const;

/** Tìm HV (cùng cơ sở nhóm) CHƯA thuộc nhóm nào để thêm vào nhóm. */
export async function searchStudentsForGroup(
  groupId: string,
  query: string,
): Promise<{ ok: boolean; items?: { id: string; name: string; studentCode: string | null }[]; error?: string }> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Chưa đăng nhập" };
  if (!can(session.user, "class_group:edit")) return { ok: false, error: "Không có quyền" };

  const group = await db.classGroup.findUnique({ where: { id: groupId }, select: { centerId: true } });
  if (!group) return { ok: false, error: "Không tìm thấy nhóm" };

  const q = query.trim();
  const items = await db.student.findMany({
    where: {
      deletedAt: null,
      classGroupId: null,
      centerId: group.centerId,
      ...(q
        ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { studentCode: { contains: q, mode: "insensitive" } }] }
        : {}),
    },
    orderBy: { name: "asc" },
    take: 15,
    select: { id: true, name: true, studentCode: true },
  });
  return { ok: true, items };
}

/** Thêm HV vào nhóm (1 HV tối đa 1 nhóm). */
export async function addStudentToGroup(input: { groupId: string; studentId: string }): Promise<ActionResult & { ok?: boolean }> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Chưa đăng nhập" };
  if (!can(session.user, "class_group:edit")) return { ok: false, error: "Không có quyền" };

  const student = await db.student.findFirst({
    where: { id: input.studentId, deletedAt: null },
    select: { id: true, classGroupId: true },
  });
  if (!student) return { ok: false, error: "Không tìm thấy học viên" };
  if (student.classGroupId && student.classGroupId !== input.groupId) {
    return { ok: false, error: "Học viên đã thuộc nhóm khác — gỡ khỏi nhóm cũ trước" };
  }
  await db.student.update({ where: { id: student.id }, data: { classGroupId: input.groupId } });
  revalidatePath(`/class-groups/${input.groupId}`);
  return { ok: true };
}

/** Gỡ HV khỏi nhóm (không xoá HV). */
export async function removeStudentFromGroup(input: { groupId: string; studentId: string }): Promise<ActionResult & { ok?: boolean }> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Chưa đăng nhập" };
  if (!can(session.user, "class_group:edit")) return { ok: false, error: "Không có quyền" };
  await db.student.update({ where: { id: input.studentId }, data: { classGroupId: null } });
  revalidatePath(`/class-groups/${input.groupId}`);
  return { ok: true };
}

/** Gán (ghi danh) các HV ĐÃ CHỌN của nhóm vào 1 lớp của nhóm. */
export async function enrollGroupIntoClass(input: {
  groupId: string;
  classId: string;
  studentIds: string[];
}): Promise<{ ok: boolean; created?: number; skipped?: number; error?: string }> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Chưa đăng nhập" };
  if (!can(session.user, "enrollments:create")) return { ok: false, error: "Không có quyền ghi danh" };

  const cls = await db.class.findFirst({
    where: { id: input.classId, deletedAt: null },
    select: { id: true, courseId: true, classGroupId: true },
  });
  if (!cls) return { ok: false, error: "Lớp không tồn tại" };
  if (cls.classGroupId !== input.groupId) return { ok: false, error: "Lớp không thuộc nhóm này" };
  if (input.studentIds.length === 0) return { ok: false, error: "Chưa chọn học viên" };

  let created = 0;
  let skipped = 0;
  for (const studentId of input.studentIds) {
    const existing = await db.enrollment.findFirst({
      where: { studentId, classId: cls.id, status: { in: [...ENROLL_ACTIVE] } },
      select: { id: true },
    });
    if (existing) {
      skipped++;
      continue;
    }
    await db.enrollment.create({
      data: { studentId, classId: cls.id, courseId: cls.courseId, status: "CONFIRMED", confirmedAt: new Date(), notes: `Ghi danh theo nhóm ${input.groupId}` },
    });
    created++;
  }
  revalidatePath(`/class-groups/${input.groupId}`);
  revalidatePath(`/classes/${cls.id}`);
  return { ok: true, created, skipped };
}
