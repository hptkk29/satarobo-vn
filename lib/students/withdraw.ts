import "server-only";

// lib/students/withdraw.ts — phần CASCADE của "Nghỉ học hẳn": gỡ học viên khỏi mọi lớp
// còn sống + tạo yêu cầu hoàn tiền cho từng ghi danh vừa gỡ.
//
// TÁCH RA THÀNH LIB VÌ ĐÃ TỪNG HỎNG Ở ĐÂY (bug 21/08/2026): `withdrawStudentAction`
// tự chép tay danh sách trạng thái ghi danh cần dọn —
// `["PENDING","CONFIRMED","STUDYING","PAUSED"]` — và BỎ SÓT `ACTIVE`. Mà `ACTIVE` là
// giá trị MẶC ĐỊNH của `Enrollment.status` (prisma/schema.prisma:1822) và là thứ hai
// đường convert lead sinh ra (`lib/crm/convert-lead.ts:136`,
// `lib/crm/convert-lead-v2.ts:286`, kể cả bulk-convert) ⇒ phần lớn học viên THẬT mang
// ghi danh `ACTIVE`. Roster lớp lại CÓ lọc `ACTIVE`, nên bấm đúng nút "❌ Nghỉ học hẳn"
// mà em đó vẫn nằm nguyên trong lớp, vẫn bị điểm danh — và cũng không có yêu cầu hoàn
// tiền nào được tạo (vòng lặp tạo hoàn tiền nằm trong chính vòng lặp bỏ sót).
//
// Nay chỉ còn MỘT nguồn sự thật: `REMOVABLE_ENROLLMENT_STATUSES`, dùng chung với
// `deleteStudent`. Có test hồi quy ở `tests/e2e/r7/withdraw-student-legacy-active.spec.ts`.
import type { Prisma } from "@prisma/client";
import { createRefundRequest } from "@/lib/finance/refund";
import {
  removeStudentFromClasses,
  type RemovedEnrollment,
} from "@/lib/students/remove-from-classes";

/**
 * Gọi BÊN TRONG transaction đã đổi `Student.status = INACTIVE` — gỡ lớp, hoàn tiền và
 * đổi trạng thái học viên phải cùng sống cùng chết.
 *
 * Idempotent: học viên đã sạch lớp thì trả mảng rỗng và không tạo yêu cầu hoàn tiền nào
 * (`createRefundRequest` cũng tự idempotent theo cặp enrollment × trigger, và bỏ qua khi
 * chưa thu được đồng nào).
 *
 * Cách ly cơ sở: lọc theo `studentId` — caller PHẢI kiểm quyền trên học viên trước
 * (scopedDb KHÔNG che write).
 */
export async function withdrawStudentFromAllClasses(params: {
  tx: Prisma.TransactionClient;
  studentId: string;
  actorId: string | null;
  actorName: string;
  /** Lý do đã kèm tiền tố, ví dụ `Học viên nghỉ học: <lý do admin nhập>`. */
  reason: string;
  orgUnitId?: string | null;
}): Promise<RemovedEnrollment[]> {
  const removed = await removeStudentFromClasses({
    tx: params.tx,
    studentId: params.studentId,
    actorId: params.actorId,
    actorName: params.actorName,
    reason: params.reason,
    orgUnitId: params.orgUnitId ?? null,
  });

  for (const enr of removed) {
    // W3-1 / LMS-9 — HS nghỉ học → yêu cầu hoàn tiền (PENDING) cho ghi danh còn sống,
    // trong cùng transaction. Idempotent + chỉ tạo khi đã có khoản thu xác nhận.
    await createRefundRequest({
      enrollmentId: enr.id,
      trigger: "WITHDRAW",
      reason: params.reason,
      requestedById: params.actorId,
      actorName: params.actorName,
      tx: params.tx,
    });
  }

  return removed;
}
