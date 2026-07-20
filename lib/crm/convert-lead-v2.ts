// lib/crm/convert-lead-v2.ts — R7-05 ⚠️ Convert v2: guard PAYMENT_REQUIRED + đa học viên
// + dedupe parent/student + consent + mã HV v2, tất cả ATOMIC. Giữ convert-lead.ts cũ cho
// regression (flag CONVERT_V2_ENABLED). Side-effect (notify) đi DomainEvent SAU commit.
import { db } from "@/lib/db";
import { writeAudit, type AuditActor } from "@/lib/audit/audit-log";
import { publishEvent } from "@/lib/events/publish";
import { genStudentCodeV2 } from "@/lib/codegen";
import { computeEnrollmentPrice } from "@/lib/finance/pricing";
import { findParentMatch, findExistingStudent } from "@/lib/crm/dedupe";
import type { CourseDiscountType } from "@prisma/client";

export type ConvertV2Result =
  | { ok: true; studentIds: string[]; enrollmentIds: string[]; deduped: boolean }
  | { ok: false; error: { code: string; message: string } };

/**
 * Guard điều kiện convert (THUẦN — AC1/C1/C3): cho convert khi đã có khoản Sale
 * ghi nhận (saleStatus=RECORDED), HOẶC tổng phải-thu = 0 (học bổng toàn phần →
 * cần ghi audit lý do). Theo R7-05-C2: kế toán CHƯA xác nhận vẫn pass — phiếu thu
 * (confirmPayment) sinh per Enrollment nên chỉ confirm được SAU khi convert tạo
 * Enrollment; đòi CONFIRMED trước convert là deadlock.
 */
export function evaluatePaymentGuard(input: {
  hasRecordedPayment: boolean;
  totalFinalPrice: number;
}): { ok: true; scholarshipFull: boolean } | { ok: false } {
  if (input.hasRecordedPayment) return { ok: true, scholarshipFull: false };
  if (input.totalFinalPrice === 0) return { ok: true, scholarshipFull: true };
  return { ok: false };
}

/**
 * FL2-01 — Tính 2 đợt học phí cho convert. THUẦN (testable). Tổng 2 đợt LUÔN bằng
 * `orderTotal` (clamp dot1 vào [0, orderTotal]; dot2 = phần còn lại) để không vi phạm
 * ràng buộc của `recordInstallmentPlan` (dot1+dot2 === order.totalAmount). dot1 = số
 * tiền đã thu ở đợt 1; dot2 = số còn lại hẹn đóng (dueDate).
 */
export function computeInstallmentSplit(
  orderTotal: number,
  dot1Amount: number,
): { dot1: number; dot2: number } {
  const safeTotal = Math.max(0, Math.round(orderTotal));
  const dot1 = Math.min(Math.max(0, Math.round(dot1Amount)), safeTotal);
  return { dot1, dot2: safeTotal - dot1 };
}

export type ConvertV2Student = {
  leadChildId?: string | null;
  name: string;
  dob?: Date | null;
  courseId: string;
  discount?: { type: CourseDiscountType; value: number } | null;
  listPrice: number;
  classId: string;
  consentMedia: boolean;
};

export type ConvertV2Input = {
  leadId: string;
  parentEmail: string;
  parentName: string;
  parentPhone: string;
  // C5 — CCCD + địa chỉ phụ huynh (lưu trên User, KHÔNG lưu trên Student). Optional/additive.
  parentCccd?: string | null;
  parentAddress?: string | null;
  parentWard?: string | null; // phường/xã (2 cấp 2025)
  parentCity?: string | null; // tỉnh/thành
  students: ConvertV2Student[];
  /** Khoá idempotency ổn định theo submit (chống double-submit / 2 Sale song song). */
  idempotencyKey: string;
};

export async function convertLeadV2(actor: AuditActor, input: ConvertV2Input): Promise<ConvertV2Result> {
  if (input.students.length === 0) {
    return { ok: false, error: { code: "NO_STUDENT", message: "Cần ít nhất 1 học viên" } };
  }

  // 0) Idempotency — đã xử lý key này → trả kết quả cũ (AC2 double-submit).
  const seen = await db.idempotencyKey.findUnique({ where: { key: input.idempotencyKey } });
  if (seen?.result) {
    const r = seen.result as { studentIds?: string[]; enrollmentIds?: string[] };
    return { ok: true, studentIds: r.studentIds ?? [], enrollmentIds: r.enrollmentIds ?? [], deduped: true };
  }

  const lead = await db.lead.findUnique({
    where: { id: input.leadId },
    select: { id: true, status: true, centerId: true, parentName: true, phone: true },
  });
  if (!lead) return { ok: false, error: { code: "LEAD_NOT_FOUND", message: "Không tìm thấy lead" } };
  if (!lead.centerId) return { ok: false, error: { code: "LEAD_NO_CENTER", message: "Lead chưa thuộc cơ sở" } };
  // 1) C2 — BỎ chặn status (REGISTERED không phải cổng nghiệp vụ thật; xem PH-2). Cho convert
  //    từ MỌI status chưa kết thúc — cổng tiền (PAYMENT_REQUIRED) bên dưới mới là điều kiện chốt.
  //    Atomic-claim bên dưới (status notIn terminal) vẫn chống race double-submit.

  // 2) Guard PAYMENT_REQUIRED (R7-05-C2): ≥1 Payment Sale ghi nhận
  //    (saleStatus=RECORDED) trên order của lead, hoặc Σ finalPrice = 0.
  const prices = input.students.map((s) =>
    computeEnrollmentPrice({ listPrice: s.listPrice, discount: s.discount ?? null }),
  );
  const totalFinalPrice = prices.reduce((sum, p) => sum + p.finalPrice, 0);
  const recordedCount = await db.payment.count({
    where: { saleStatus: "RECORDED", order: { leadId: lead.id } },
  });
  const guard = evaluatePaymentGuard({ hasRecordedPayment: recordedCount > 0, totalFinalPrice });
  if (!guard.ok) {
    return { ok: false, error: { code: "PAYMENT_REQUIRED", message: "Cần ghi nhận khoản thanh toán trước khi chốt" } };
  }

  // 3) Dedupe parent (3 nhánh). Conflict → tạo ConvertConflict + khoá convert (AC3).
  const parentMatch = await findParentMatch({ email: input.parentEmail, phone: input.parentPhone });
  if (parentMatch.kind === "conflict") {
    await db.convertConflict.upsert({
      where: { id: `${lead.id}` }, // 1 conflict OPEN / lead (id = leadId cho idempotent)
      create: {
        id: lead.id,
        leadId: lead.id,
        parentAId: parentMatch.parentAId,
        parentBId: parentMatch.parentBId,
        status: "OPEN",
      },
      update: { parentAId: parentMatch.parentAId, parentBId: parentMatch.parentBId, status: "OPEN" },
    });
    return { ok: false, error: { code: "PARENT_CONFLICT", message: "Email và SĐT khớp 2 hồ sơ khác nhau — cần Admin xử lý" } };
  }

  const result = await db.$transaction(async (tx) => {
    // CLAIM atomic chống race (2 Sale song song): chỉ 1 lượt chuyển khỏi status chưa-kết-thúc.
    // C2 — điều kiện claim đổi từ status=REGISTERED sang status NOT IN (terminal): vẫn chỉ 1
    // lượt thắng (lượt sau thấy status=ENROLLED ∈ terminal → count 0 → ALREADY_CONVERTED).
    const claim = await tx.lead.updateMany({
      where: { id: lead.id, status: { notIn: ["ENROLLED", "LOST", "DUPLICATE"] }, deletedAt: null },
      data: { status: "ENROLLED", convertedById: actor.id, convertedAt: new Date() },
    });
    if (claim.count === 0) throw new Error("ALREADY_CONVERTED");

    const center = await tx.center.findUnique({ where: { id: lead.centerId! }, select: { code: true } });
    const centerCode = center?.code ?? "CS";

    // C5 — CCCD + địa chỉ phụ huynh (chỉ ghi field có giá trị, không ghi đè bằng null).
    const parentExtra = {
      ...(input.parentCccd?.trim() ? { cccd: input.parentCccd.trim() } : {}),
      ...(input.parentAddress?.trim() ? { address: input.parentAddress.trim() } : {}),
      ...(input.parentWard?.trim() ? { ward: input.parentWard.trim() } : {}),
      ...(input.parentCity?.trim() ? { city: input.parentCity.trim() } : {}),
    };

    // Parent: reuse hồ sơ cũ hoặc tạo mới (PENDING_ACTIVATION).
    const parent =
      parentMatch.kind === "reuse"
        ? await tx.user.update({ where: { id: parentMatch.userId }, data: { centerId: lead.centerId, ...parentExtra } })
        : await tx.user.upsert({
            where: { email: input.parentEmail.trim().toLowerCase() },
            update: { centerId: lead.centerId, ...parentExtra },
            create: {
              email: input.parentEmail.trim().toLowerCase(),
              name: input.parentName,
              role: "PARENT",
              roles: ["PARENT"],
              accountStatus: "PENDING_ACTIVATION",
              centerId: lead.centerId,
              ...parentExtra,
            },
          });

    const studentIds: string[] = [];
    const enrollmentIds: string[] = [];
    for (let i = 0; i < input.students.length; i++) {
      const s = input.students[i]!;
      const price = prices[i]!;
      // Dedupe student same-parent → dùng lại; chỉ tạo Enrollment mới (AC4).
      const existingId = await findExistingStudent(
        { parentUserId: parent.id, name: s.name, dob: s.dob ?? null },
        tx,
      );
      const studentId =
        existingId ??
        (
          await tx.student.create({
            data: {
              name: s.name,
              studentCode: await genStudentCodeV2(centerCode, tx),
              dateOfBirth: s.dob ?? null,
              parentUserId: parent.id,
              centerId: lead.centerId,
              parentName: input.parentName,
              parentPhone: input.parentPhone.replace(/\D/g, ""),
              parentEmail: input.parentEmail.trim().toLowerCase(),
            },
            select: { id: true },
          })
        ).id;
      studentIds.push(studentId);

      const enrollment = await tx.enrollment.create({
        data: {
          studentId,
          classId: s.classId,
          courseId: s.courseId,
          centerId: lead.centerId, // FL3-02 — denormalize từ lead/class (cùng cơ sở) cho scopedDb
          leadChildId: s.leadChildId ?? null, // R7-06 — truy vết về con nguồn
          listPrice: price.listPrice,
          discountType: price.discountType,
          discountAmount: price.discountAmount,
          finalPrice: price.finalPrice,
          tuition: price.finalPrice, // giữ field cũ đồng bộ (2-phase)
        },
        select: { id: true },
      });
      enrollmentIds.push(enrollment.id);

      // Consent ảnh per học viên + audit người tick (AC5).
      if (s.consentMedia) {
        await tx.studentConsent.upsert({
          where: { studentId_type: { studentId, type: "CLASS_MEDIA" } },
          create: { studentId, type: "CLASS_MEDIA", status: "GRANTED" },
          update: { status: "GRANTED", revokedAt: null },
        });
        await writeAudit({
          actor,
          module: "enrollment",
          entityType: "StudentConsent",
          entityId: studentId,
          action: "CONSENT_GRANTED_AT_CONVERT",
          newValues: { type: "CLASS_MEDIA", grantedBy: actor.id },
          orgUnitId: lead.centerId,
          tx,
        });
      }
    }

    // FIN-01 (MVP link-only) — mắt xích còn thiếu: sau khi tạo Enrollment, GẮN các khoản
    // RECORDED của đơn (theo leadId, chưa gắn ghi danh) vào ghi danh vừa tạo. Nhờ đó
    // confirmPayment chạy được (đòi enrollmentId để sinh Receipt) → kế toán xác nhận →
    // getDebtRows phản ánh. CHỈ tự gắn khi ĐÚNG 1 ghi danh (1:1 rõ ràng); nhiều ghi danh
    // → split chưa chốt nghiệp vụ (xem FIN-01), để kế toán gắn tay. KHÔNG auto-confirm ở
    // đây (giữ tách vai kế toán — người convert thường không phải kế toán).
    if (enrollmentIds.length === 1) {
      await tx.payment.updateMany({
        where: {
          saleStatus: "RECORDED",
          enrollmentId: null,
          deletedAt: null,
          order: { leadId: lead.id },
        },
        data: { enrollmentId: enrollmentIds[0]! },
      });
    }

    await writeAudit({
      actor,
      module: "enrollment",
      entityType: "Lead",
      entityId: lead.id,
      action: "STATUS_CHANGE",
      oldValues: { status: lead.status },
      newValues: { status: "ENROLLED", studentIds, scholarshipFull: guard.scholarshipFull },
      reason: guard.scholarshipFull ? "SCHOLARSHIP_FULL" : undefined,
      orgUnitId: lead.centerId,
      tx,
    });

    // Ghi idempotency key (cùng tx) → double-submit sau trả kết quả này.
    await tx.idempotencyKey.create({
      data: { key: input.idempotencyKey, scope: "convert", result: { studentIds, enrollmentIds } },
    });

    return { parentId: parent.id, studentIds, enrollmentIds };
  });

  // SAU commit — side-effect không-atomic.
  await publishEvent("lead.converted", {
    leadId: lead.id,
    studentId: result.studentIds[0],
    parentUserId: result.parentId,
  });
  await publishEvent("consent.granted", { studentIds: result.studentIds, leadId: lead.id });

  return { ok: true, studentIds: result.studentIds, enrollmentIds: result.enrollmentIds, deduped: false };
}
