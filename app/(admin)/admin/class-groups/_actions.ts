"use server";

import { auth } from "@/lib/auth";
import { can, assertCan } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { classGroupCreateSchema } from "@/lib/validators/class-group";
import { centerIdForOrgUnit } from "@/lib/org/org-service";
import { genClassGroupCode } from "@/lib/codegen";
import { resolveActor, type Actor } from "@/lib/auth/actor";
import { scopedDb, passesScope } from "@/lib/db-scope";

type ActionResult = { error?: string };

// Cách ly cơ sở (chống IDOR ghi): ClassGroup/Student/Class ∈ SCOPED_MODELS;
// Enrollment relation-scoped qua class.centerId. Mutation theo id từ client phải
// xác minh record thuộc tầm nhìn cơ sở của actor trước khi ghi.
function actorCanUseCenter(actor: Actor, centerId: string | null): boolean {
  if (actor.isSuperAdmin || actor.isHoLevel) return true;
  return centerId != null && actor.visibleCenterIds.includes(centerId);
}

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
    orgUnitId: s("orgUnitId"),
    status: s("status") ?? "ACTIVE",
    notes: s("notes"),
  };
}

export async function createClassGroup(
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireWrite("create");

  const parsed = classGroupCreateSchema.safeParse(readForm(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" };
  }
  const data = parsed.data;

  // PR-C: orgUnitId là picker; centerId suy ra (HO loại khỏi list nên phải có center).
  const orgUnitId = data.orgUnitId ?? null;
  const centerId = await centerIdForOrgUnit(orgUnitId);
  if (!centerId) return { error: "Nhóm lớp phải thuộc một cơ sở cụ thể" };

  // Cách ly cơ sở: chỉ tạo nhóm lớp cho cơ sở trong tầm nhìn actor.
  if (session.user.id) {
    const actor = await resolveActor(session.user.id);
    if (!actorCanUseCenter(actor, centerId)) {
      return { error: "Không có quyền tạo nhóm lớp cho cơ sở này" };
    }
  }

  const center = await db.center.findUnique({
    where: { id: centerId },
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
          // PR-C dual-write: ghi cả centerId + orgUnitId.
          centerId,
          orgUnitId,
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
  const session = await requireWrite("edit");

  const parsed = classGroupCreateSchema.safeParse(readForm(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" };
  }
  const data = parsed.data;

  // Cách ly cơ sở: nhóm lớp hiện tại phải thuộc tầm nhìn actor (sdb null-filter).
  const uid = session.user.id;
  if (!uid) return { error: "Phiên không hợp lệ" };
  const actor = await resolveActor(uid);
  const sdb = scopedDb(actor);
  const existing = await sdb.classGroup.findUnique({
    where: { id },
    select: { id: true, centerId: true },
  });
  if (!existing || !passesScope("ClassGroup", existing, actor)) {
    return { error: "Nhóm lớp không tồn tại" };
  }

  // PR-C: orgUnitId là picker; centerId suy ra (HO loại khỏi list nên phải có center).
  const orgUnitId = data.orgUnitId ?? null;
  const centerId = await centerIdForOrgUnit(orgUnitId);
  if (!centerId) return { error: "Nhóm lớp phải thuộc một cơ sở cụ thể" };

  // Đổi cơ sở → cơ sở đích cũng phải trong tầm nhìn actor.
  if (!actorCanUseCenter(actor, centerId)) {
    return { error: "Không có quyền chuyển nhóm lớp sang cơ sở này" };
  }

  await db.classGroup.update({
    where: { id },
    data: {
      displayCode: data.displayCode,
      name: data.name,
      // PR-C dual-write: ghi cả centerId + orgUnitId.
      centerId,
      orgUnitId,
      status: data.status,
      notes: data.notes,
    },
  });

  revalidatePath("/class-groups");
  revalidatePath(`/class-groups/${id}`);
  redirect("/class-groups");
}

export async function deleteClassGroup(id: string): Promise<ActionResult> {
  const session = await requireWrite("delete");
  // Cách ly cơ sở: chỉ xoá nhóm lớp trong tầm nhìn actor (chống IDOR).
  if (session.user.id) {
    const actor = await resolveActor(session.user.id);
    const sdb = scopedDb(actor);
    const existing = await sdb.classGroup.findUnique({ where: { id }, select: { centerId: true } });
    if (!existing || !passesScope("ClassGroup", existing, actor)) {
      return { error: "Nhóm lớp không tồn tại" };
    }
  }
  await db.classGroup.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
  revalidatePath("/class-groups");
  return {};
}

/**
 * Xoá (mềm) nhóm lớp — dùng cho nút "Xóa" trên bảng danh sách admin.
 * ClassGroup có cột `deletedAt` → soft delete (set deletedAt = now).
 */
export async function deleteClassGroupAction(
  id: string,
): Promise<{ ok: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Chưa đăng nhập" };
  try {
    assertCan(session.user, "class_group:delete");
  } catch {
    return { ok: false, error: "Không có quyền" };
  }

  // Cách ly cơ sở: chỉ xoá nhóm lớp trong tầm nhìn actor (chống IDOR).
  if (session.user.id) {
    const actor = await resolveActor(session.user.id);
    const sdb = scopedDb(actor);
    const existing = await sdb.classGroup.findUnique({ where: { id }, select: { centerId: true } });
    if (!existing || !passesScope("ClassGroup", existing, actor)) {
      return { ok: false, error: "Nhóm lớp không tồn tại" };
    }
  }

  try {
    await db.classGroup.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  } catch {
    return { ok: false, error: "Không thể xoá nhóm lớp này" };
  }

  revalidatePath("/class-groups");
  return { ok: true };
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

  const uid = session.user.id;
  if (!uid) return { ok: false, error: "Phiên không hợp lệ" };
  const actor = await resolveActor(uid);
  const sdb = scopedDb(actor);
  const student = await sdb.student.findFirst({
    where: { id: input.studentId, deletedAt: null },
    select: { id: true, classGroupId: true, centerId: true },
  });
  // Cách ly cơ sở: HV phải thuộc tầm nhìn actor.
  if (!student || !passesScope("Student", student, actor)) {
    return { ok: false, error: "Không tìm thấy học viên" };
  }
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
  // Cách ly cơ sở: chỉ gỡ HV trong tầm nhìn actor (chống IDOR).
  if (session.user.id) {
    const actor = await resolveActor(session.user.id);
    const sdb = scopedDb(actor);
    const student = await sdb.student.findUnique({ where: { id: input.studentId }, select: { centerId: true } });
    if (!student || !passesScope("Student", student, actor)) {
      return { ok: false, error: "Không tìm thấy học viên" };
    }
  }
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

  // Cách ly cơ sở: lớp đích phải thuộc tầm nhìn actor (sdb null-filter + passesScope).
  const uid = session.user.id;
  if (!uid) return { ok: false, error: "Phiên không hợp lệ" };
  const actor = await resolveActor(uid);
  const sdb = scopedDb(actor);
  const cls = await sdb.class.findFirst({
    where: { id: input.classId, deletedAt: null },
    select: { id: true, courseId: true, classGroupId: true, centerId: true },
  });
  if (!cls || !passesScope("Class", cls, actor)) {
    return { ok: false, error: "Lớp không tồn tại" };
  }
  if (cls.classGroupId !== input.groupId) return { ok: false, error: "Lớp không thuộc nhóm này" };
  if (input.studentIds.length === 0) return { ok: false, error: "Chưa chọn học viên" };

  // Chỉ ghi danh HV trong tầm nhìn cơ sở của actor (loại id ngoài scope).
  const scopedStudents = await sdb.student.findMany({
    where: { id: { in: input.studentIds }, deletedAt: null },
    select: { id: true },
  });
  const allowedStudentIds = new Set(scopedStudents.map((s) => s.id));

  let created = 0;
  let skipped = 0;
  for (const studentId of input.studentIds) {
    if (!allowedStudentIds.has(studentId)) {
      skipped++;
      continue;
    }
    const existing = await db.enrollment.findFirst({
      where: { studentId, classId: cls.id, status: { in: [...ENROLL_ACTIVE] } },
      select: { id: true },
    });
    if (existing) {
      skipped++;
      continue;
    }
    await db.enrollment.create({
      data: { studentId, classId: cls.id, courseId: cls.courseId, centerId: cls.centerId, status: "CONFIRMED", confirmedAt: new Date(), notes: `Ghi danh theo nhóm ${input.groupId}` },
    });
    created++;
  }
  revalidatePath(`/class-groups/${input.groupId}`);
  revalidatePath(`/classes/${cls.id}`);
  return { ok: true, created, skipped };
}
