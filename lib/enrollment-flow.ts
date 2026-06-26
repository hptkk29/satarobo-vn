// lib/enrollment-flow.ts — Helper cho luồng đăng ký / chuyển cơ sở / hoàn thành khoá
// (FixLMS FL2-05, FL2-06). Nhận diện "Hội sở" QUA OrgUnit tree (type ≠ CENTER) —
// KHÔNG hardcode mã "HO" hay tên cơ sở. Mở CS mới (type=CENTER) tự được coi là cơ
// sở nhận học viên mà không sửa code.
import { db } from "@/lib/db";
import type { OrgUnitType } from "@prisma/client";

// ─── FL2-05 — loại Hội sở khỏi picker/list đơn vị nhận học viên ───────────────

/**
 * Pure: từ danh sách OrgUnit → các `centerId` KHÔNG nhận học viên (đơn vị không phải
 * cơ sở vận hành: HO/ROOT/PARTNER…). Chỉ OrgUnit type=CENTER mới là cơ sở nhận HV
 * (Doc 15 OI-1: HO là đơn vị độc lập, không nhận học viên). Bỏ qua node đã xoá mềm.
 */
export function nonEnrollableCenterIds(
  orgUnits: { type: OrgUnitType; centerId: string | null; deletedAt?: Date | null }[],
): string[] {
  return orgUnits
    .filter((o) => o.type !== "CENTER" && o.deletedAt == null && o.centerId != null)
    .map((o) => o.centerId as string);
}

/** DB-backed: `centerId` của các đơn vị KHÔNG nhận học viên (vd Center của Hội sở). */
export async function getNonEnrollableCenterIds(): Promise<string[]> {
  const rows = await db.orgUnit.findMany({
    where: { deletedAt: null, type: { not: "CENTER" }, centerId: { not: null } },
    select: { type: true, centerId: true },
  });
  return nonEnrollableCenterIds(rows);
}

/**
 * Where-fragment loại các cơ sở khỏi truy vấn theo `centerId` model nghiệp vụ
 * (Student/Class…). GIỮ row có `centerId = null` (legacy chưa gán) để không ẩn nhầm,
 * chỉ loại đúng row trỏ tới cơ sở Hội sở. Rỗng → không thêm điều kiện (no-op).
 */
export function notHeadOfficeWhere(
  excludeCenterIds: string[],
): { OR: ({ centerId: null } | { centerId: { notIn: string[] } })[] } | Record<string, never> {
  if (excludeCenterIds.length === 0) return {};
  return { OR: [{ centerId: null }, { centerId: { notIn: excludeCenterIds } }] };
}

// ─── FL2-06 — dây chuyền HS → khoá đang học → lớp (hoàn thành khoá) ────────────

export type StudentCourseChain = {
  courseId: string;
  courseName: string;
  classes: { classId: string; label: string }[];
};

/**
 * Pure: gom enrollment ĐANG HỌC của 1 học viên thành dây chuyền khoá → lớp. Mỗi
 * khoá gom các lớp HV đang theo (khử trùng lớp). Dùng cho stepper hoàn thành khoá:
 * chọn HV → khoá (đang học) → lớp (theo khoá).
 */
export function buildStudentCourseChain(
  enrollments: {
    courseId: string;
    course: { name: string };
    classId: string;
    class: { name: string; classCode: string | null };
  }[],
): StudentCourseChain[] {
  const byCourse = new Map<string, StudentCourseChain>();
  for (const e of enrollments) {
    let entry = byCourse.get(e.courseId);
    if (!entry) {
      entry = { courseId: e.courseId, courseName: e.course.name, classes: [] };
      byCourse.set(e.courseId, entry);
    }
    if (!entry.classes.some((c) => c.classId === e.classId)) {
      entry.classes.push({
        classId: e.classId,
        label: e.class.name + (e.class.classCode ? ` (${e.class.classCode})` : ""),
      });
    }
  }
  return Array.from(byCourse.values());
}
