// lib/auth/lms-scope.ts — P2/LMS-1..4: owner-scope dùng lại cho các action LMS
// thao tác theo LỚP (điểm danh, chấm bài, hoàn tất buổi...).
//
// Quy tắc (khớp mẫu chuẩn assignSessionHomeworkAction):
//   1) cách ly cơ sở: lớp phải thuộc cơ sở actor nhìn thấy (passesScope "Class");
//   2) ownership: quản lý cùng cơ sở (SUPER_ADMIN/HO/CENTER_MANAGER) HOẶC
//      GV/trợ giảng phụ trách đúng lớp đó (assignedClassIds).
//
// KHÔNG phụ thuộc việc bật RBAC v2 — chạy được ngay với actor đã resolve.
import { passesScope } from "@/lib/db-scope";
import type { Actor } from "@/lib/auth/actor";

/** Actor là quản lý (xuyên lớp trong phạm vi cơ sở) chứ không chỉ GV 1 lớp. */
export function isManagerActor(actor: Actor): boolean {
  return (
    actor.isSuperAdmin ||
    actor.isHoLevel ||
    actor.orgRoles.some((r) => r.roleCode === "CENTER_MANAGER")
  );
}

/**
 * Actor được thao tác (sửa/xóa) dữ liệu thuộc lớp `classId` không?
 * - false nếu lớp ngoài cơ sở actor (cách ly cơ sở), hoặc
 * - actor không phải quản lý VÀ không phụ trách lớp.
 */
export function canManageClass(
  actor: Actor,
  classId: string,
  classCenterId: string | null,
): boolean {
  if (!passesScope("Class", { centerId: classCenterId }, actor)) return false;
  return isManagerActor(actor) || actor.assignedClassIds.has(classId);
}
