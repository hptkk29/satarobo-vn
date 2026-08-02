// lib/crm/bulk-convert.ts — CHỐT HÀNG LOẠT lead "đã đăng ký" (nhập liệu ban đầu CS1/CS2).
//
// Bối cảnh: import Excel (/admin/leads/import/registered) dừng ở Lead REGISTERED +
// LeadChild; convert v2 chỉ có UI per-lead. File này là CẦU NỐI: mỗi lead →
// convertLeadV2 (tái dùng nguyên transaction: dedupe parent/student, tạo User
// PENDING_ACTIVATION, Enrollment vào lớp, consent, idempotency).
//
// Tiền (backfill — khách đã đóng TRƯỚC khi có hệ thống):
//  - Nhập "đã đóng X, ngày Y" → tạo Order tối thiểu + Payment saleStatus=RECORDED
//    (paidDate lùi ngày thật) TRƯỚC khi convert ⇒ qua guard PAYMENT_REQUIRED tự
//    nhiên, và linkRecordedPaymentsToEnrollments (FIN-01) gắn khoản vào ghi danh
//    → công nợ (getDebtRows) phản ánh đúng phần còn thiếu.
//  - Không nhập tiền → convertLeadV2 với allowNoPayment (audit BACKFILL_IMPORT);
//    KHÔNG bịa khoản thu.
// Idempotent per-lead: payment đánh dấu BACKFILL_PAYMENT_MARKER trong note (gọi
// lại không tạo trùng); convert dùng idempotencyKey ổn định theo payload.
import { createHash } from "node:crypto";
import { db } from "@/lib/db";
import { writeAudit, type AuditActor } from "@/lib/audit/audit-log";
import { generateOrderCode, withUniqueRetry } from "@/lib/orders/code";
import { convertLeadV2, type ConvertV2Student } from "@/lib/crm/convert-lead-v2";
import { canonicalPhone } from "@/lib/phone";

export const BACKFILL_PAYMENT_MARKER = "[backfill-import]";
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

type LeadRow = {
  id: string;
  status: string;
  centerId: string | null;
  parentName: string;
  phone: string;
  email: string | null;
};

type ClassRow = {
  id: string;
  centerId: string | null;
  courseId: string;
  name: string;
  course: { name: string; price: number | null } | null;
};

/**
 * Tạo Order tối thiểu + Payment RECORDED cho khoản khách đã đóng trước hệ thống.
 * IDEMPOTENT theo marker trong Payment.note (per lead) — gọi lại không tạo trùng.
 * Order tạo thẳng CONFIRMED (tiền đã về từ trước, không cần vòng xác nhận):
 * KHÔNG đi changeOrderStatusAction nên không kích side-effect provision — convert
 * ngay sau đó mới là chỗ tạo tài khoản phụ huynh.
 */
export async function ensureBackfillOrderPayment(params: {
  actor: AuditActor;
  lead: LeadRow;
  items: Array<{ itemName: string; unitPrice: number }>;
  paid: { amount: number; paidDate: Date; note?: string | null };
}): Promise<{ created: boolean; paymentId: string | null }> {
  const { actor, lead, items, paid } = params;

  const existing = await db.payment.findFirst({
    where: { deletedAt: null, note: { contains: BACKFILL_PAYMENT_MARKER }, order: { leadId: lead.id } },
    select: { id: true },
  });
  if (existing) return { created: false, paymentId: existing.id };

  const totalAmount = items.reduce((s, it) => s + Math.max(0, Math.round(it.unitPrice)), 0);
  const amount = Math.round(paid.amount);

  const paymentId = await withUniqueRetry(() =>
    db.$transaction(async (tx) => {
      const order = await tx.order.create({
        data: {
          code: await generateOrderCode(tx),
          type: "COURSE",
          status: "CONFIRMED",
          customerName: lead.parentName,
          customerPhone: lead.phone,
          customerEmail: lead.email,
          leadId: lead.id,
          centerId: lead.centerId,
          subtotal: totalAmount,
          totalAmount,
          paidAt: paid.paidDate,
          confirmedByUserId: actor.id,
          confirmedAt: paid.paidDate,
          items: {
            create: items.map((it) => ({
              type: "COURSE_ENROLLMENT" as const,
              itemName: it.itemName,
              quantity: 1,
              unitPrice: Math.max(0, Math.round(it.unitPrice)),
              totalPrice: Math.max(0, Math.round(it.unitPrice)),
            })),
          },
        },
        select: { id: true, code: true },
      });

      const payment = await tx.payment.create({
        data: {
          orderId: order.id,
          amount,
          method: "backfill",
          paidDate: paid.paidDate,
          note: `Nhập liệu ban đầu — khoản đã thu trước khi lên hệ thống${
            paid.note?.trim() ? ` (${paid.note.trim()})` : ""
          } ${BACKFILL_PAYMENT_MARKER}`,
          saleStatus: "RECORDED",
          accountantStatus: "PENDING",
          recordedById: actor.id,
          centerId: lead.centerId,
        },
        select: { id: true },
      });

      await writeAudit({
        actor,
        module: "finance",
        entityType: "Payment",
        entityId: payment.id,
        action: "CREATE",
        newValues: {
          amount,
          saleStatus: "RECORDED",
          source: "bulk-convert-backfill",
          orderCode: order.code,
          paidDate: paid.paidDate.toISOString(),
        },
        orgUnitId: lead.centerId,
        tx,
      });

      return payment.id;
    }),
  );

  return { created: true, paymentId };
}

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
 * đã assertCan + passesScope theo centerId của lead trước khi gọi.
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

  // Lớp: phải tồn tại, chưa xoá, CÙNG CƠ SỞ với lead (chống ghi danh chéo cơ sở).
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
  const paidAmount = input.paid ? Math.round(input.paid.amount) : 0;
  if (input.paid && paidAmount > 0) {
    const recordedCount = await db.payment.count({
      where: { saleStatus: "RECORDED", deletedAt: null, order: { leadId: lead.id } },
    });
    if (recordedCount > 0) {
      warning = "Lead đã có khoản ghi nhận trong hệ thống — bỏ qua số tiền nhập ở lô này";
    } else {
      await ensureBackfillOrderPayment({
        actor,
        lead,
        items: students.map((s) => ({
          itemName: `${classMap.get(s.classId)!.course?.name ?? "Khoá học"} — ${s.name}`,
          unitPrice: s.listPrice,
        })),
        paid: { amount: paidAmount, paidDate: input.paid.paidDate, note: input.paid.note ?? null },
      });
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
      // Không có tiền ghi nhận → đi nhánh backfill có audit (thay vì chặn PAYMENT_REQUIRED).
      allowNoPayment: { reason: BACKFILL_AUDIT_REASON },
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
