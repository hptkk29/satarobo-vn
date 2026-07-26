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

/**
 * T3.2 — gán / đổi SALE PHỤ TRÁCH của 1 ghi danh trong lớp.
 * Cách ly cơ sở 2 chiều: (1) lớp phải trong tầm nhìn actor, (2) sale được gán phải
 * CÙNG cơ sở với lớp (chống gán chéo CS1↔CS2 bằng POST tay). `saleId = null` = gỡ.
 */
export async function setEnrollmentSaleAction(
  classId: string,
  enrollmentId: string,
  saleId: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const g = await gate();
  if (!g.ok) return { ok: false, error: g.error };
  if (!(await assertClassInScope(g.gate.actor, classId))) {
    return { ok: false, error: "Lớp không thuộc cơ sở bạn quản lý" };
  }

  const sdb = scopedDb(g.gate.actor);
  const cls = await sdb.class.findFirst({
    where: { id: classId, deletedAt: null },
    select: { centerId: true },
  });
  if (!cls) return { ok: false, error: "Lớp không tồn tại" };

  if (saleId) {
    const sale = await sdb.user.findUnique({
      where: { id: saleId },
      select: { id: true, centerId: true, deletedAt: true },
    });
    if (!sale || sale.deletedAt) return { ok: false, error: "Không tìm thấy nhân sự này" };
    // Lớp có cơ sở → sale phải cùng cơ sở. Lớp HO (centerId null) → không ràng buộc.
    if (cls.centerId && sale.centerId !== cls.centerId) {
      return { ok: false, error: "Sale phụ trách phải thuộc cùng cơ sở với lớp" };
    }
  }

  const res = await sdb.enrollment.updateMany({
    where: { id: enrollmentId, classId },
    data: { saleId },
  });
  if (res.count === 0) return { ok: false, error: "Ghi danh không thuộc lớp này" };

  revalidatePath(`/classes/${classId}/students`);
  return { ok: true };
}

/**
 * (a) PA-B 22/07 — nút gộp "Chuyển sang Đang học": các ghi danh ĐÃ XẾP (CONFIRMED)
 * được tick chọn chuyển hàng loạt sang STUDYING (bỏ tick em chưa đóng đủ tiền).
 * KHÔNG tự động khi duyệt lớp (quyết định PA-B): giữ bước kiểm soát của giáo vụ.
 */
export async function promoteConfirmedAction(
  classId: string,
  enrollmentIds: string[],
): Promise<{ ok: boolean; promoted?: number; error?: string }> {
  const g = await gate();
  if (!g.ok) return { ok: false, error: g.error };
  if (!(await assertClassInScope(g.gate.actor, classId))) {
    return { ok: false, error: "Lớp không thuộc cơ sở bạn quản lý" };
  }
  const ids = [...new Set(enrollmentIds)].filter(Boolean);
  if (ids.length === 0) return { ok: false, error: "Chưa chọn học viên nào" };

  const sdb = scopedDb(g.gate.actor);
  // Chỉ CONFIRMED của ĐÚNG lớp này → STUDYING (id lạ / trạng thái khác bị lọc im lặng).
  const res = await sdb.enrollment.updateMany({
    where: { id: { in: ids }, classId, status: "CONFIRMED" },
    data: { status: "STUDYING" },
  });
  // Mốc bắt đầu học: chỉ đặt cho em chưa có (không ghi đè lịch sử).
  await sdb.enrollment.updateMany({
    where: { id: { in: ids }, classId, status: "STUDYING", startedAt: null },
    data: { startedAt: new Date() },
  });

  if (res.count > 0) {
    revalidatePath(`/classes/${classId}/students`);
    revalidatePath(`/classes/${classId}/edit`);
    revalidatePath("/enrollments");
  }
  return { ok: true, promoted: res.count };
}
