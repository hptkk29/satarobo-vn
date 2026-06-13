// lib/crm/convert-lead.ts — R2-02 ⚠️ TRỌNG TÂM: chốt lead → học viên trong 1 TRANSACTION.
// Lead→ENROLLED + Parent(PENDING_ACTIVATION) + Student + Enrollment + Order(invoice) + Audit,
// tất cả atomic (lỗi 1 bước → rollback toàn bộ, C2.2). Event `lead.converted` phát SAU commit
// (C2.3/C2.5 — activation/notify đi qua handler, KHÔNG trong transaction).
import { db } from "@/lib/db";
import { writeAudit, type AuditActor } from "@/lib/audit/audit-log";
import { publishEvent } from "@/lib/events/publish";
import { nextInvoiceCode } from "@/lib/finance/invoice-code";

export class ConvertError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "ConvertError";
    this.code = code;
  }
}

/**
 * C5.1 — kiểm tra trùng SĐT trước khi convert: trả lead/student cũ (90 ngày) để UI cảnh báo.
 * Không chặn — chỉ cung cấp dữ liệu để hiển thị (quyết định do người dùng).
 */
export async function findConvertDuplicates(
  phone: string,
  now: Date = new Date(),
): Promise<{ leads: { id: string; status: string }[]; students: { id: string; name: string }[] }> {
  const norm = phone.replace(/\D/g, "");
  const cutoff = new Date(now.getTime() - 90 * 86_400_000);
  const [leads, students] = await Promise.all([
    db.lead.findMany({
      where: { phone: norm, deletedAt: null, createdAt: { gte: cutoff } },
      select: { id: true, status: true },
    }),
    db.student.findMany({
      where: { parentPhone: norm },
      select: { id: true, name: true },
    }),
  ]);
  return { leads, students };
}

export type ConvertLeadInput = {
  leadId: string;
  classId: string;
  courseId: string;
  parentEmail: string;
  childName?: string;
  amount: number;
  paidAmount?: number;
  reason?: string;
  now?: Date;
};

export async function convertLeadToEnrollment(actor: AuditActor, input: ConvertLeadInput) {
  const now = input.now ?? new Date();

  const result = await db.$transaction(async (tx) => {
    const lead = await tx.lead.findUnique({ where: { id: input.leadId } });
    if (!lead || lead.deletedAt) throw new ConvertError("LEAD_NOT_FOUND", "Không tìm thấy lead.");
    if (lead.status === "ENROLLED") throw new ConvertError("ALREADY_ENROLLED", "Lead đã được chốt.");
    if (!lead.centerId) throw new ConvertError("LEAD_NO_CENTER", "Lead chưa thuộc cơ sở nào — bàn giao trước.");

    // R6-G2 — CLAIM atomic chống race: 2 convert song song chỉ 1 bộ. updateMany có điều
    // kiện status!=ENROLLED khoá hàng lead; lượt thua thấy count=0 → ALREADY_ENROLLED.
    const claim = await tx.lead.updateMany({
      where: { id: lead.id, status: { not: "ENROLLED" }, deletedAt: null },
      data: { status: "ENROLLED", convertedById: actor.id, convertedAt: now },
    });
    if (claim.count === 0) throw new ConvertError("ALREADY_ENROLLED", "Lead đã được chốt.");

    const center = await tx.center.findUnique({ where: { id: lead.centerId }, select: { code: true } });
    const centerCode = center?.code ?? "CS";

    // Parent: KHÔNG mật khẩu mặc định (C4.1) — PENDING_ACTIVATION.
    const parent = await tx.user.upsert({
      where: { email: input.parentEmail },
      update: { centerId: lead.centerId },
      create: {
        email: input.parentEmail,
        name: lead.parentName,
        role: "PARENT",
        roles: ["PARENT"],
        accountStatus: "PENDING_ACTIVATION",
        centerId: lead.centerId,
      },
    });

    const student = await tx.student.create({
      data: {
        name: input.childName ?? lead.childName ?? lead.parentName,
        parentUserId: parent.id,
        centerId: lead.centerId,
        parentName: lead.parentName,
        parentPhone: lead.phone,
        parentEmail: input.parentEmail,
      },
    });

    const enrollment = await tx.enrollment.create({
      data: { studentId: student.id, classId: input.classId, courseId: input.courseId },
    });

    const paid = (input.paidAmount ?? 0) > 0;
    const order = await tx.order.create({
      data: {
        code: await nextInvoiceCode(tx, centerCode, now.getUTCFullYear()),
        type: "COURSE",
        customerName: lead.parentName,
        customerPhone: lead.phone,
        centerId: lead.centerId,
        subtotal: input.amount,
        totalAmount: input.amount,
        status: paid ? "CONFIRMED" : "PENDING_PAYMENT",
        paidAt: paid ? now : null,
      },
    });

    // (status=ENROLLED + convertedBy/At đã set ở bước CLAIM atomic phía trên — G2.)

    await writeAudit({
      actor, module: "enrollment", entityType: "Lead", entityId: lead.id, action: "STATUS_CHANGE",
      oldValues: { status: lead.status },
      newValues: { status: "ENROLLED", studentId: student.id, orderCode: order.code },
      reason: input.reason, orgUnitId: lead.centerId, tx,
    });

    return { lead, parent, student, enrollment, order };
  });

  // SAU commit: side-effect không-atomic (activation email, stats...) qua DomainEvent (C2.5).
  await publishEvent("lead.converted", {
    leadId: result.lead.id,
    studentId: result.student.id,
    parentUserId: result.parent.id,
    orderCode: result.order.code,
  });

  return result;
}
