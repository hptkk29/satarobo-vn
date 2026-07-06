"use server";

// R7-07 (PR1) — gán học viên vào lớp: server-action mỏng (auth + can + scope cơ sở).
// Logic nghiệp vụ ở lib/lms/assign.ts. Override sức chứa cần quyền cao hơn
// (classes:create — SUPER_ADMIN/CENTER_MANAGER) + audit (ghi trong lib).
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/auth/check-permission";
import { resolveActor, type Actor } from "@/lib/auth/actor";
import { scopedDb, passesScope } from "@/lib/db-scope";
import { getAuditActor } from "@/lib/audit/log";
import {
  assignEnrollments,
  assignAllFiltered,
  type AssignResult,
} from "@/lib/lms/assign";

type Gate = { actor: Actor; actorId: string | null; actorName: string };

async function gate(): Promise<
  { ok: true; gate: Gate } | { ok: false; error: string }
> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Chưa đăng nhập" };
  if (!(await checkPermission("classes:edit"))) {
    return { ok: false, error: "Không có quyền gán học viên" };
  }
  const actor = await resolveActor(session.user.id);
  const { actorId, actorName } = getAuditActor(session);
  return { ok: true, gate: { actor, actorId, actorName } };
}

/** Lớp ∈ cơ sở của actor? (scopedDb lọc + passesScope phòng vệ). */
async function assertClassInScope(
  actor: Actor,
  classId: string,
): Promise<boolean> {
  const sdb = scopedDb(actor);
  const cls = await sdb.class.findFirst({
    where: { id: classId, deletedAt: null },
    select: { id: true, centerId: true },
  });
  return Boolean(cls) && passesScope("Class", { centerId: cls?.centerId ?? null }, actor);
}

async function canOverrideCapacity(): Promise<boolean> {
  const session = await auth();
  if (!session?.user) return false;
  return checkPermission("classes:create");
}

/** Gán danh sách enrollment đã chọn vào lớp. */
export async function assignSelectedAction(
  classId: string,
  enrollmentIds: string[],
  override = false,
): Promise<AssignResult> {
  const g = await gate();
  if (!g.ok) return { ok: false, error: g.error };
  if (!(await assertClassInScope(g.gate.actor, classId))) {
    return { ok: false, error: "Lớp không thuộc cơ sở bạn quản lý" };
  }
  if (override && !(await canOverrideCapacity())) {
    return { ok: false, error: "Không có quyền override sức chứa" };
  }

  const res = await assignEnrollments({
    classId,
    enrollmentIds,
    override,
    actorId: g.gate.actorId,
    actorName: g.gate.actorName,
  });

  if (res.ok) {
    revalidatePath(`/classes/${classId}/students`);
    revalidatePath(`/classes/${classId}/edit`);
    revalidatePath("/enrollments");
  }
  return res;
}

/** "Thêm toàn bộ" theo bộ lọc đủ điều kiện. */
export async function assignAllFilteredAction(
  classId: string,
  override = false,
): Promise<AssignResult> {
  const g = await gate();
  if (!g.ok) return { ok: false, error: g.error };
  if (!(await assertClassInScope(g.gate.actor, classId))) {
    return { ok: false, error: "Lớp không thuộc cơ sở bạn quản lý" };
  }
  if (override && !(await canOverrideCapacity())) {
    return { ok: false, error: "Không có quyền override sức chứa" };
  }

  const res = await assignAllFiltered({
    classId,
    override,
    actorId: g.gate.actorId,
    actorName: g.gate.actorName,
  });

  if (res.ok) {
    revalidatePath(`/classes/${classId}/students`);
    revalidatePath(`/classes/${classId}/edit`);
    revalidatePath("/enrollments");
  }
  return res;
}
