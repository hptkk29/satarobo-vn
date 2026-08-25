// lib/crm/convert-lead-v2.ts — R7-05 ⚠️ Convert v2: guard PAYMENT_REQUIRED + đa học viên
// + dedupe parent/student + consent + mã HV v2, tất cả ATOMIC. Giữ convert-lead.ts cũ cho
// regression (flag CONVERT_V2_ENABLED). Side-effect (notify) đi DomainEvent SAU commit.
import { db } from "@/lib/db";
import { writeAudit, type AuditActor } from "@/lib/audit/audit-log";
import { publishEvent } from "@/lib/events/publish";
import { genStudentCodeV2 } from "@/lib/codegen";
import { computeEnrollmentPrice } from "@/lib/finance/pricing";
import { linkRecordedPaymentsToEnrollments } from "@/lib/finance/payment";
import { findParentMatch, findExistingStudent } from "@/lib/crm/dedupe";
import { canonicalPhone } from "@/lib/phone";
import { recordLeadStatusChange } from "@/lib/leads/set-status";
import {
  createBackfillOrderPaymentInTx,
  type BackfillPaymentInput,
} from "@/lib/crm/backfill-order";
import { syncConversationMembership } from "@/lib/chat/sync-membership";
import {
  ensureCommissionStatement,
  findAttendedTrialForLeadChild,
  recordTrialTeacherCommission,
  type AttendedTrial,
  type CommissionStatementRef,
} from "@/lib/crm/trial-teacher-commission";
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
  /** AUTH-SĐT P5 — KHÔNG còn bắt buộc; khoá định danh là `parentPhone`. */
  parentEmail: string | null;
  parentName: string;
  /** Canonical `84…` (validator `phoneVn` đã transform). Khoá định danh tài khoản. */
  parentPhone: string;
  // C5 — CCCD + địa chỉ phụ huynh (lưu trên User, KHÔNG lưu trên Student). Optional/additive.
  parentCccd?: string | null;
  parentAddress?: string | null;
  parentWard?: string | null; // phường/xã (2 cấp 2025)
  parentCity?: string | null; // tỉnh/thành
  students: ConvertV2Student[];
  /** Khoá idempotency ổn định theo submit (chống double-submit / 2 Sale song song). */
  idempotencyKey: string;
  /**
   * BACKFILL (chốt hàng loạt lead nhập từ Excel cũ) — cho qua guard PAYMENT_REQUIRED
   * khi lead lịch sử không có Payment RECORDED trong hệ thống. BẮT BUỘC kèm lý do
   * (ghi vào AuditLog). Chỉ đường bulk-convert (gate leads:view-all + leads:import)
   * được set — form convert thường KHÔNG truyền field này.
   */
  allowNoPayment?: { reason: string } | null;
  /**
   * BACKFILL có tiền: khoản khách đã đóng TRƯỚC hệ thống. Order + Payment RECORDED
   * được tạo TRONG transaction convert (convert fail → tiền rollback theo, không
   * để khoản ma; race 2 lượt song song do atomic-claim giải). Có field này thì
   * guard PAYMENT_REQUIRED coi như thoả.
   */
  backfillPayment?: BackfillPaymentInput | null;
  /**
   * 27/08 — GIẢI TRÌNH ƯU ĐÃI (miễn phí / học bổng / giảm giá) do người chốt gõ ở
   * form convert. KHÔNG phải cổng quyền: guard tiền vẫn là `evaluatePaymentGuard`
   * (tổng sau ưu đãi = 0 ⇒ qua). Field này chỉ để lý do đi vào `AuditLog.reason` —
   * "ai cho em này miễn phí, vì cái gì" phải tra được, vì tiền biến mất khỏi công
   * nợ ngay tại đây. Rỗng/không truyền ⇒ giữ nguyên hành vi cũ.
   */
  discountReason?: string | null;
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
    // T3.2 — assignedToId = sale đang phụ trách lead → thành Enrollment.saleId.
    select: {
      id: true,
      status: true,
      centerId: true,
      parentName: true,
      phone: true,
      assignedToId: true,
    },
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
  const guard = evaluatePaymentGuard({
    // backfillPayment sẽ tạo khoản RECORDED trong chính transaction bên dưới → coi như đã có.
    hasRecordedPayment: recordedCount > 0 || Boolean(input.backfillPayment),
    totalFinalPrice,
  });
  // Backfill KHÔNG tiền: guard fail nhưng caller đã khai lý do → cho qua, ghi audit bên dưới.
  const backfillNoPayment = !guard.ok && Boolean(input.allowNoPayment?.reason?.trim());
  if (!guard.ok && !backfillNoPayment) {
    return { ok: false, error: { code: "PAYMENT_REQUIRED", message: "Cần ghi nhận khoản thanh toán trước khi chốt" } };
  }
  const scholarshipFull = guard.ok ? guard.scholarshipFull : false;
  // Lý do ưu đãi chỉ có nghĩa khi CÓ ưu đãi thật (Σ discountAmount > 0) — không để
  // chuỗi rác của caller bám vào audit của lead chốt giá đầy đủ.
  const totalDiscountAmount = prices.reduce((sum, p) => sum + p.discountAmount, 0);
  const discountReason = totalDiscountAmount > 0 ? input.discountReason?.trim() || null : null;

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

  // ── Chuẩn bị phần HOA HỒNG TRƯỚC transaction (25/08) ───────────────────────────
  //
  // Hai việc dưới đây CỐ Ý nằm ngoài `db.$transaction`:
  //   • tra "con đã học thử ở lớp nào" — thuần ĐỌC, không cần atomic;
  //   • dựng `CommissionStatement` của kỳ — `upsert` của Prisma trên model nhiều unique
  //     biên dịch thành đọc-rồi-ghi, nên hai lượt convert song song vào lần đầu tiên của
  //     tháng có thể đâm P2002. Ném bên trong transaction là RỔ CẢ LƯỢT CONVERT (mất
  //     lead claim, phụ huynh, học viên, ghi danh, đơn học phí) — đã dựng lại được lỗi
  //     này trên Postgres thật. Ở ngoài thì P2002 chỉ có nghĩa "người khác vừa tạo
  //     trước", bắt và đọc lại là xong.
  //
  // Một mốc thời gian DUY NHẤT cho cả lượt convert: nhiều học viên trong cùng một lượt
  // phải rơi vào CÙNG kỳ hoa hồng, kể cả khi transaction chạy vắt qua nửa đêm.
  const now = new Date();
  const attendedTrials = new Map<string, AttendedTrial>();
  for (const s of input.students) {
    if (!s.leadChildId || attendedTrials.has(s.leadChildId)) continue;
    const t = await findAttendedTrialForLeadChild(db, s.leadChildId);
    if (t) attendedTrials.set(s.leadChildId, t);
  }
  const needsCommission = [...attendedTrials.values()].some((t) => t.teacherUserId);
  let commissionStatement: CommissionStatementRef | null = null;
  if (needsCommission) {
    commissionStatement = await ensureCommissionStatement(now);
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
    // GĐ1 — giữ nguyên `updateMany` làm lượt claim atomic (hai Sale bấm cùng lúc thì
    // chỉ một lượt thắng), chỉ nối thêm sổ. `from` là trạng thái đọc TRƯỚC claim.
    await recordLeadStatusChange({
      tx,
      leadId: lead.id,
      from: lead.status,
      to: "ENROLLED",
      source: "convert",
      actorId: actor.id,
      actorName: actor.name ?? null,
    });

    const center = await tx.center.findUnique({ where: { id: lead.centerId! }, select: { code: true } });
    const centerCode = center?.code ?? "CS";

    // BACKFILL có tiền — tạo Order + Payment RECORDED TRONG tx (sau claim nên
    // 2 lượt song song chỉ 1 lượt tạo được; fail chỗ nào sau đây là rollback cả
    // tiền lẫn ghi danh). Đặt TRƯỚC linkRecordedPaymentsToEnrollments để khoản
    // vừa tạo được gắn vào enrollment ngay trong cùng transaction.
    if (input.backfillPayment) {
      await createBackfillOrderPaymentInTx(tx, {
        actor,
        lead: {
          id: lead.id,
          centerId: lead.centerId,
          parentName: lead.parentName,
          phone: lead.phone,
          email: input.parentEmail,
        },
        paid: input.backfillPayment,
      });
    }

    // C5 — CCCD + địa chỉ phụ huynh (chỉ ghi field có giá trị, không ghi đè bằng null).
    const parentExtra = {
      ...(input.parentCccd?.trim() ? { cccd: input.parentCccd.trim() } : {}),
      ...(input.parentAddress?.trim() ? { address: input.parentAddress.trim() } : {}),
      ...(input.parentWard?.trim() ? { ward: input.parentWard.trim() } : {}),
      ...(input.parentCity?.trim() ? { city: input.parentCity.trim() } : {}),
    };

    // AUTH-SĐT P5 — khoá định danh phụ huynh là SĐT canonical, email tuỳ chọn.
    //
    // Trước P5 chỗ này `upsert({ where: { email } })`. Với email nullable, đó là
    // **bom hẹn giờ**: Prisma nhận `where: { email: undefined }` rồi ném lỗi runtime
    // chứ không trả null — mỗi lead không có email sẽ làm vỡ cả transaction convert.
    // Nay khoá theo `phone` (@unique, luôn có mặt vì `phoneVn` bắt buộc).
    const parentPhone = canonicalPhone(input.parentPhone) ?? input.parentPhone;
    const parentEmail = input.parentEmail?.trim().toLowerCase() || null;
    let parent;
    if (parentMatch.kind === "reuse") {
      // Hồ sơ cũ (tạo trước P5) thường chưa có `phone` — bổ sung để lần sau đăng
      // nhập/dedupe đi được bằng SĐT. CHỈ điền khi đang TRỐNG: ghi đè là đổi định
      // danh đăng nhập của người ta. Cùng lý do với email.
      const current = await tx.user.findUnique({
        where: { id: parentMatch.userId },
        select: { phone: true, email: true },
      });
      // SĐT đã thuộc user KHÁC → bỏ qua, để `@unique` không làm vỡ cả convert.
      const phoneFree =
        !current?.phone &&
        !(await tx.user.findFirst({
          where: { phone: parentPhone, id: { not: parentMatch.userId } },
          select: { id: true },
        }));
      parent = await tx.user.update({
        where: { id: parentMatch.userId },
        data: {
          centerId: lead.centerId,
          ...parentExtra,
          ...(phoneFree ? { phone: parentPhone } : {}),
          ...(parentEmail && !current?.email ? { email: parentEmail } : {}),
        },
      });
    } else {
      parent = await tx.user.upsert({
        where: { phone: parentPhone },
        update: { centerId: lead.centerId, ...parentExtra },
        create: {
          phone: parentPhone,
          email: parentEmail,
          name: input.parentName,
          role: "PARENT",
          roles: ["PARENT"],
          accountStatus: "PENDING_ACTIVATION",
          centerId: lead.centerId,
          ...parentExtra,
        },
      });
    }

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
              // AUTH-SĐT P1 (gom tồn dư 31/07) — ĐƯỜNG GHI phải ra canonical `84…`.
              // `replace(/\D/g,"")` cũ giữ nguyên `0905…` ⇒ mỗi lần convert lại bào mòn
              // kết quả backfill 29/07. Giữ nguyên fallback digit-strip cho đầu vào không
              // chuẩn hoá được (số cố định gọi thẳng từ lib) — không đổi hành vi ca đó.
              parentPhone: canonicalPhone(input.parentPhone) ?? input.parentPhone.replace(/\D/g, ""),
              parentEmail,
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
          saleId: lead.assignedToId ?? null, // T3.2 — sale phụ trách theo sang ghi danh
          listPrice: price.listPrice,
          discountType: price.discountType,
          discountAmount: price.discountAmount,
          finalPrice: price.finalPrice,
          tuition: price.finalPrice, // giữ field cũ đồng bộ (2-phase)
        },
        select: { id: true },
      });
      enrollmentIds.push(enrollment.id);

      // ── Học thử → nhập học: đóng sổ trải nghiệm + hoa hồng GV dạy Trial (25/08) ──
      //
      // Trước đây convert KHÔNG hề đụng tới các bảng Trial: sau khi con nhập học,
      // `LeadTrialHistory.outcome` vẫn nằm nguyên ở "PENDING" — nghĩa là cột đó chưa
      // bao giờ mang giá trị nào khác, dù `lib/trial/sale-roster.ts` đã đọc
      // `outcome === "ENROLLED"` để bật cờ "đã nhập học". Cờ ấy vì thế luôn tắt.
      //
      // Nay đóng sổ NGAY TRONG transaction convert (cùng chỗ tạo Enrollment) để không
      // có khe hở "đã ghi danh nhưng sổ trải nghiệm chưa biết".
      const trial = s.leadChildId ? (attendedTrials.get(s.leadChildId) ?? null) : null;
      if (trial) {
        // Đóng sổ ĐÚNG lớp trải nghiệm con đã học, và chỉ dòng còn PENDING.
        //
        // Bản đầu lọc mỗi `leadChildId` — hai lỗi trong một: (1) nó đè cả dòng đã mang
        // "LOST" của lần học thử trước (nhánh LOST ở updateLeadStatus có lọc PENDING,
        // nhánh này thì không ⇒ hai đường bất đối xứng, và lịch sử "đã từng rớt" biến
        // mất); (2) nó bật "ENROLLED" cho MỌI lớp trải nghiệm con từng vào, kể cả lớp ở
        // cơ sở khác — mà site GV in nhãn "Đã nhập học · +1% HH" theo cặp
        // (leadChildId, trialClassId), nên giáo viên KHÔNG được trả đồng nào vẫn thấy
        // hệ thống hứa trả 1%. Đó là cãi nhau về lương, không phải lỗi hiển thị.
        await tx.leadTrialHistory.updateMany({
          where: {
            leadChildId: s.leadChildId!,
            trialClassId: trial.trialClassId,
            outcome: "PENDING",
          },
          data: { outcome: "ENROLLED" },
        });

        // +1% học phí cho GV đã dạy buổi trải nghiệm. Bỏ qua khi lớp chưa gán GV hoặc
        // học phí 0 — hoa hồng KHÔNG được phép làm hỏng việc ghi danh (xem đầu
        // lib/crm/trial-teacher-commission.ts).
        if (trial.teacherUserId && commissionStatement) {
          const res = await recordTrialTeacherCommission(tx, {
            statement: commissionStatement,
            teacherUserId: trial.teacherUserId,
            enrollmentId: enrollment.id,
            finalPrice: price.finalPrice,
            leadId: lead.id,
            note: `Trial → nhập học: ${s.name} · ${trial.trialClassName}`,
          });
          // Kỳ đã chốt sổ ⇒ không ghi được dòng nào. KHÔNG được im lặng: giáo viên mất
          // tiền mà không ai biết, và không có job đối soát nào cho tầng này. Để lại
          // dấu vết ở AuditLog để kế toán mở lại kỳ rồi bù tay.
          if (res && !res.ok) {
            await writeAudit({
              actor,
              module: "commission",
              entityType: "Enrollment",
              entityId: enrollment.id,
              action: "TRIAL_TEACHER_COMMISSION_SKIPPED",
              newValues: {
                reason: res.reason,
                period: res.period,
                amount: res.amount,
                recipientId: trial.teacherUserId,
                trialClassId: trial.trialClassId,
              },
              orgUnitId: lead.centerId,
              tx,
            });
          }
        }
      }

      // Consent ảnh per học viên + audit người tick (AC5).
      // ⚠️ KHÔNG lật consent đã THU HỒI: học viên dedupe (dùng lại hồ sơ cũ) có thể
      // mang REVOKED do phụ huynh rút — tick ở form convert/bulk không phải là lời
      // re-grant tường minh (C6.4: thu hồi phải dính cho tới khi có luồng cấp lại riêng).
      const existingConsent = s.consentMedia
        ? await tx.studentConsent.findUnique({
            where: { studentId_type: { studentId, type: "CLASS_MEDIA" } },
            select: { status: true },
          })
        : null;
      if (s.consentMedia && existingConsent?.status !== "REVOKED") {
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

    // FIN-01 (Q1=A) — mắt xích còn thiếu: sau khi tạo Enrollment(s), GẮN (và CHIA khi nhiều
    // ghi danh) các khoản RECORDED của đơn vào ghi danh → confirmPayment sinh Receipt được →
    // getDebtRows phản ánh. Nhiều ghi danh: chia theo finalPrice (bất biến tổng). KHÔNG
    // auto-confirm ở đây (giữ tách vai kế toán). weights ↔ enrollmentIds cùng thứ tự students.
    await linkRecordedPaymentsToEnrollments(tx, {
      leadId: lead.id,
      enrollmentIds,
      weights: prices.map((p) => p.finalPrice),
      actor,
    });

    await writeAudit({
      actor,
      module: "enrollment",
      entityType: "Lead",
      entityId: lead.id,
      action: "STATUS_CHANGE",
      oldValues: { status: lead.status },
      newValues: {
        status: "ENROLLED",
        studentIds,
        scholarshipFull,
        backfillNoPayment,
        totalDiscountAmount,
        totalFinalPrice,
      },
      reason: scholarshipFull
        ? `SCHOLARSHIP_FULL${discountReason ? `: ${discountReason}` : ""}`
        : backfillNoPayment
          ? input.allowNoPayment!.reason.trim()
          : discountReason
            ? `DISCOUNT: ${discountReason}`
            : undefined,
      orgUnitId: lead.centerId,
      tx,
    });

    // US-03 chat — HV vào lớp qua convert (kể cả bulk-convert + import lead) → PH vào
    // nhóm lớp trong CÙNG transaction (BR-12). Sync theo tập lớp distinct.
    for (const classId of new Set(input.students.map((s) => s.classId))) {
      await syncConversationMembership(tx, classId);
    }

    // Ghi idempotency key (cùng tx) → double-submit sau trả kết quả này.
    await tx.idempotencyKey.create({
      data: { key: input.idempotencyKey, scope: "convert", result: { studentIds, enrollmentIds } },
    });

    return { parentId: parent.id, studentIds, enrollmentIds };
  },
  {
    // Không đặt thì Prisma dùng mặc định 5s — chốt 1 lead làm RẤT nhiều việc trong
    // cùng transaction (claim lead, tạo/gộp User phụ huynh, N học viên, N ghi danh,
    // đơn hàng + khoản thu backfill, consent, idempotency, audit). 5s vừa đủ khi
    // app và DB cùng vùng, nhưng hết ngay khi đường truyền chậm hoặc lead nhiều con
    // — và lỗi hiện ra dưới dạng khó hiểu ("Transaction not found... old closed
    // transaction"), không phải "quá giờ". Đo 05/08 khi chốt lô nhập liệu đầu tiên.
    timeout: 30_000,
    maxWait: 15_000,
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
