// lib/crm/bulk-convert.ts — CHỐT HÀNG LOẠT lead "đã đăng ký" (nhập liệu ban đầu CS1/CS2).
//
// Bối cảnh: import Excel (/admin/leads/import/registered) dừng ở Lead REGISTERED +
// LeadChild; convert v2 chỉ có UI per-lead. File này là CẦU NỐI: mỗi lead →
// convertLeadV2 (tái dùng nguyên transaction: dedupe parent/student, tạo User
// PENDING_ACTIVATION, Enrollment vào lớp, consent, idempotency).
//
// Tiền (backfill — khách đã đóng TRƯỚC khi có hệ thống):
//  - Nhập "đã đóng X, ngày Y" → truyền `backfillPayment` vào convertLeadV2: Order
//    tối thiểu + Payment RECORDED (paidDate lùi ngày thật) tạo TRONG transaction
//    convert ⇒ convert fail là tiền rollback theo (không để khoản ma), race 2 lượt
//    song song do atomic-claim giải; FIN-01 link khoản vào enrollment cùng tx nên
//    công nợ (getDebtRows) phản ánh đúng phần còn thiếu.
//  - Không nhập tiền → allowNoPayment (audit BACKFILL_IMPORT); KHÔNG bịa khoản thu.
// Idempotent per-lead: idempotencyKey ổn định theo payload + atomic-claim của convert.
import { createHash } from "node:crypto";
import { db } from "@/lib/db";
import type { AuditActor } from "@/lib/audit/audit-log";
import { convertLeadV2, type ConvertV2Student } from "@/lib/crm/convert-lead-v2";
import { BACKFILL_PAYMENT_MARKER, type BackfillPaymentInput } from "@/lib/crm/backfill-order";
import { canonicalPhone } from "@/lib/phone";

export { BACKFILL_PAYMENT_MARKER };
export const BACKFILL_AUDIT_REASON = "BACKFILL_IMPORT: nhập liệu ban đầu, chưa ghi nhận khoản thu trong hệ thống";

export type BulkConvertStudentInput = {
  leadChildId?: string | null;
  name: string;
  dob?: Date | null;
  classId: string;
  consentMedia: boolean;
};

export type BulkConvertLeadInput = {
  leadId: string;
  students: BulkConvertStudentInput[];
  /** Khoản đã đóng từ trước. Bỏ trống = chưa ghi nhận tiền (đi nhánh allowNoPayment). */
  paid?: { amount: number; paidDate: Date; note?: string | null } | null;
};

export type BulkConvertLeadResult = {
  leadId: string;
  ok: boolean;
  code?: string;
  message?: string;
  studentIds?: string[];
  enrollmentIds?: string[];
  deduped?: boolean;
  /** Cảnh báo không chặn (vd: đã có khoản RECORDED nên bỏ qua số tiền nhập). */
  warning?: string;
};

type ClassRow = {
  id: string;
  centerId: string | null;
  courseId: string;
  name: string;
  course: { name: string; price: number | null } | null;
};

/** Khoá idempotency ổn định theo payload (mirror submitConvertV2). */
export function bulkConvertIdempotencyKey(
  leadId: string,
  students: Array<{ name: string; classId: string }>,
): string {
  const fingerprint = JSON.stringify(
    students.map((s) => ({ name: s.name.trim().toLowerCase(), classId: s.classId })),
  );
  return `bulkconvert:${leadId}:${createHash("sha256").update(fingerprint).digest("hex").slice(0, 16)}`;
}

/**
 * Chốt 1 lead trong lô. KHÔNG check quyền/scope ở đây — caller (Server Action)
 * đã gate leads:view-all + leads:import + passesScope (đọc lô qua scopedDb)
 * theo centerId của lead trước khi gọi.
 */
export async function convertOneLeadBackfill(
  actor: AuditActor,
  input: BulkConvertLeadInput,
): Promise<BulkConvertLeadResult> {
  const fail = (code: string, message: string): BulkConvertLeadResult => ({
    leadId: input.leadId,
    ok: false,
    code,
    message,
  });

  if (input.students.length === 0) return fail("NO_STUDENT", "Chưa chọn học viên nào");

  const lead = await db.lead.findUnique({
    where: { id: input.leadId },
    select: { id: true, status: true, centerId: true, parentName: true, phone: true, email: true, deletedAt: true },
  });
  if (!lead || lead.deletedAt) return fail("LEAD_NOT_FOUND", "Không tìm thấy lead");
  if (!lead.centerId) return fail("LEAD_NO_CENTER", "Lead chưa gắn cơ sở — sửa lead rồi chạy lại");
  if (lead.status === "ENROLLED") return fail("ALREADY_CONVERTED", "Lead đã được chốt trước đó");
  if (lead.status === "LOST" || lead.status === "DUPLICATE") {
    return fail("LEAD_TERMINAL", `Lead ở trạng thái ${lead.status} — không chốt được`);
  }

  // SĐT phải canonical hoá được (số di động VN) — đây là khoá đăng nhập của TK phụ huynh.
  const parentPhone = canonicalPhone(lead.phone);
  if (!parentPhone) {
    return fail("PHONE_INVALID", `SĐT "${lead.phone}" không hợp lệ (số bàn?) — sửa SĐT lead rồi chạy lại`);
  }

  // Lớp: phải tồn tại, chưa xoá, CÙNG CƠ SỞ với lead (chống ghi danh chéo cơ sở),
  // và khoá học PHẢI có giá > 0 — giá 0/null làm enrollment finalPrice=0 hàng loạt
  // (công nợ biến mất + audit ghi nhầm SCHOLARSHIP_FULL). Học bổng toàn phần thật
  // thì đi đường convert đơn lẻ có người nhìn từng ca.
  const classIds = [...new Set(input.students.map((s) => s.classId))];
  const classes = await db.class.findMany({
    where: { id: { in: classIds }, deletedAt: null },
    select: {
      id: true,
      centerId: true,
      courseId: true,
      name: true,
      course: { select: { name: true, price: true } },
    },
  });
  const classMap = new Map<string, ClassRow>(classes.map((c) => [c.id, c]));
  for (const s of input.students) {
    const cls = classMap.get(s.classId);
    if (!cls) return fail("CLASS_NOT_FOUND", `Lớp không tồn tại cho học viên "${s.name}"`);
    if (cls.centerId !== lead.centerId) {
      return fail("CLASS_WRONG_CENTER", `Lớp "${cls.name}" khác cơ sở với lead — chọn lớp cùng cơ sở`);
    }
    if (!cls.course?.price || cls.course.price <= 0) {
      return fail(
        "COURSE_NO_PRICE",
        `Khoá học của lớp "${cls.name}" chưa cấu hình giá — cập nhật giá khoá trước khi chốt hàng loạt`,
      );
    }
  }

  const students: ConvertV2Student[] = input.students.map((s) => {
    const cls = classMap.get(s.classId)!;
    return {
      leadChildId: s.leadChildId ?? null,
      name: s.name,
      dob: s.dob ?? null,
      courseId: cls.courseId,
      classId: s.classId,
      listPrice: cls.course?.price ?? 0,
      discount: null,
      consentMedia: s.consentMedia === true,
    };
  });

  // Tiền backfill: chỉ tạo khi CHƯA có khoản RECORDED nào của lead (tránh ghi đôi).
  let warning: string | undefined;
  let backfillPayment: BackfillPaymentInput | null = null;
  const paidAmount = input.paid ? Math.round(input.paid.amount) : 0;
  if (input.paid && paidAmount > 0) {
    const recordedCount = await db.payment.count({
      where: { saleStatus: "RECORDED", deletedAt: null, order: { leadId: lead.id } },
    });
    if (recordedCount > 0) {
      warning = "Lead đã có khoản ghi nhận trong hệ thống — bỏ qua số tiền nhập ở lô này";
    } else {
      backfillPayment = {
        amount: paidAmount,
        paidDate: input.paid.paidDate,
        note: input.paid.note ?? null,
        items: students.map((s) => ({
          itemName: `${classMap.get(s.classId)!.course?.name ?? "Khoá học"} — ${s.name}`,
          unitPrice: s.listPrice,
        })),
      };
    }
  }

  let res;
  try {
    res = await convertLeadV2(actor, {
      leadId: lead.id,
      parentEmail: lead.email?.trim().toLowerCase() || null,
      parentName: lead.parentName,
      parentPhone,
      students,
      idempotencyKey: bulkConvertIdempotencyKey(lead.id, students),
      // Có tiền → Order+Payment tạo TRONG tx convert; không tiền → nhánh backfill
      // có audit (thay vì chặn PAYMENT_REQUIRED).
      backfillPayment,
      allowNoPayment: backfillPayment ? null : { reason: BACKFILL_AUDIT_REASON },
    });
  } catch (err) {
    // convertLeadV2 ném (không trả ok:false) khi thua atomic-claim — map về lỗi dòng.
    if (err instanceof Error && err.message === "ALREADY_CONVERTED") {
      return fail("ALREADY_CONVERTED", "Lead vừa được chốt bởi lượt khác (double-submit)");
    }
    throw err;
  }

  if (!res.ok) return fail(res.error.code, res.error.message);
  return {
    leadId: lead.id,
    ok: true,
    studentIds: res.studentIds,
    enrollmentIds: res.enrollmentIds,
    deduped: res.deduped,
    warning,
  };
}
