// lib/students/remove-from-classes.ts — gỡ học viên khỏi MỌI lớp còn đang theo học.
//
// SỰ CỐ 07/08/2026: `deleteStudent` chỉ soft-delete bảng `Student` mà không đụng
// `Enrollment`. Mọi màn "học viên của lớp" đọc TỪ Enrollment → student, nên HV đã xoá
// vẫn nằm nguyên trong lớp (admin lẫn site GV), vẫn bị điểm danh, vẫn gửi thông báo cho
// phụ huynh. `/admin/students` thì lại lọc `deletedAt: null` ⇒ nhìn 2 màn thấy 2 sự thật.
//
// ⚠️ ĐỔI `status`, KHÔNG set `Enrollment.deletedAt`. `deletedAt` là "soft-delete TÀI
// CHÍNH" (schema.prisma) và bị lọc bởi soft-delete extension ⇒ set nó sẽ rút khoản phải
// thu khỏi công nợ (`lib/finance/debt.ts` lọc `deletedAt: null`, KHÔNG lọc status) và
// làm lệch phân bổ thanh toán. Đổi status giữ nguyên sổ sách, chỉ gỡ khỏi danh sách lớp.
import type { EnrollmentStatus, Prisma } from "@prisma/client";
import { writeAudit } from "@/lib/audit/audit-log";

/**
 * Ghi danh còn "sống" — học viên vẫn thuộc lớp. Rộng hơn `ENROLLMENT_ACTIVE_STATUS_LIST`
 * vì có thêm `PENDING` (chờ xếp lớp): chưa hiện ở roster nhưng vẫn phải dọn.
 */
export const REMOVABLE_ENROLLMENT_STATUSES: EnrollmentStatus[] = [
  "PENDING",
  "CONFIRMED",
  "STUDYING",
  "ACTIVE",
  "PAUSED",
];

/**
 * Trạng thái đích khi gỡ HV khỏi lớp. `PENDING` chưa từng được xếp lớp nên đi
 * `CANCELLED`; các trạng thái còn lại đi `WITHDREW`. Khớp state machine
 * `ENROLLMENT_TRANSITIONS` (`lib/enrollments/status.ts`) — PENDING KHÔNG có đích WITHDREW.
 */
export function removalTargetStatus(from: EnrollmentStatus): EnrollmentStatus {
  return from === "PENDING" ? "CANCELLED" : "WITHDREW";
}

export type RemovedEnrollment = {
  id: string;
  fromStatus: EnrollmentStatus;
  toStatus: EnrollmentStatus;
};

/**
 * Chuyển mọi ghi danh còn sống của học viên sang trạng thái kết thúc, kèm
 * `EnrollmentAuditLog` + `AuditLog` hợp nhất cho từng dòng.
 *
 * Gọi BÊN TRONG transaction đã đụng `Student` — gỡ lớp và xoá HV phải cùng sống cùng chết.
 * Idempotent: HV đã đi qua "Nghỉ học" (`withdrawStudentAction`) thì không còn dòng nào
 * khớp, hàm trả mảng rỗng.
 *
 * Cách ly cơ sở: hàm lọc theo `studentId` — caller PHẢI kiểm quyền trên học viên trước
 * (scopedDb KHÔNG che write).
 */
export async function removeStudentFromClasses(params: {
  tx: Prisma.TransactionClient;
  studentId: string;
  actorId: string | null;
  actorName: string;
  /** Lý do ghi vào audit — hiện trong lịch sử ghi danh. */
  reason: string;
  /** Cơ sở của học viên, để gắn vào AuditLog hợp nhất. */
  orgUnitId?: string | null;
}): Promise<RemovedEnrollment[]> {
  const { tx, studentId } = params;

  const live = await tx.enrollment.findMany({
    where: {
      studentId,
      status: { in: REMOVABLE_ENROLLMENT_STATUSES },
      deletedAt: null,
    },
    select: { id: true, status: true },
  });
  if (live.length === 0) return [];

  const removed: RemovedEnrollment[] = [];
  for (const enr of live) {
    const toStatus = removalTargetStatus(enr.status);

    await tx.enrollment.update({
      where: { id: enr.id },
      data: { status: toStatus },
    });

    await tx.enrollmentAuditLog.create({
      data: {
        enrollmentId: enr.id,
        fromStatus: enr.status,
        toStatus,
        changedByUserId: params.actorId,
        changedByName: params.actorName,
        reason: params.reason,
      },
    });

    await writeAudit({
      actor: { id: params.actorId, name: params.actorName },
      module: "students",
      entityType: "Enrollment",
      entityId: enr.id,
      action: "STATUS_CHANGE",
      oldValues: { status: enr.status },
      newValues: { status: toStatus },
      changedFields: ["status"],
      reason: params.reason,
      orgUnitId: params.orgUnitId ?? null,
      tx,
    });

    removed.push({ id: enr.id, fromStatus: enr.status, toStatus });
  }

  return removed;
}
