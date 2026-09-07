// lib/finance/payment.ts — R7-04: khoản thanh toán 2 tầng (Sale ghi nhận ↔ Kế toán xác nhận).
// MỌI mutation tiền chạy trong db.$transaction. Audit before/after; reject/adjust/refund
// BẮT BUỘC reason. Hàm THUẦN role-logic (can() do tầng action lo) — chỉ xử lý nghiệp vụ.
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { writeAudit, type AuditActor } from "@/lib/audit/audit-log";
import { publishEvent } from "@/lib/events/publish";
import { issueReceipt } from "@/lib/finance/receipt";
import { allocateByWeight } from "@/lib/finance/allocate";
import { recordLeadStatusChange } from "@/lib/leads/set-status";

type Tx = Prisma.TransactionClient;

/** Kết quả chung — { ok } + field phụ; lỗi → { ok:false, error }. */
type Ok<T> = { ok: true } & T;
type Fail = { ok: false; error: string };

function fail(error: string): Fail {
  return { ok: false, error };
}

/**
 * FIX-H9 — mã lỗi optimistic lock: record đã bị người khác sửa kể từ lúc client
 * đọc `updatedAt`. FE map STALE_WRITE → toast "Người khác vừa sửa, tải lại" + reload.
 */
export const STALE_WRITE = "STALE_WRITE" as const;

/** Resolve actor cho audit (chỉ có id → tra tên; null → Hệ thống). */
async function auditActor(userId: string | null | undefined): Promise<AuditActor> {
  if (!userId) return { id: null, name: "Hệ thống" };
  const u = await db.user.findUnique({ where: { id: userId }, select: { name: true } });
  return { id: userId, name: u?.name ?? userId };
}

/**
 * Tra mã cơ sở (OrgUnit.code) cho mã phiếu thu.
 * LƯU Ý: `centerId` ở đây là `Center.id` cũ (Payment.centerId ← Order.centerId, model Center).
 * Phase A map Center↔OrgUnit qua field `OrgUnit.centerId` (@unique) — KHÔNG phải OrgUnit.id.
 * → phải tra theo `where: { centerId }`, không phải `where: { id: centerId }` (id cuid không khớp).
 */
async function centerCodeOf(centerId: string | null | undefined): Promise<string> {
  if (!centerId) return "SR";
  const ou = await db.orgUnit.findUnique({ where: { centerId }, select: { code: true } });
  return ou?.code ?? "SR";
}

// ─── S1 — Hợp nhất sổ thanh toán (Ledger-B → Payment) ─────────────────────────
// Actor tối thiểu cho ghi nhận tự động: id (+name cho audit) + centerId fallback.
export type EnsurePaymentActor = { id: string | null; name?: string | null; centerId?: string | null };

const AUTO_PAYMENT_METHOD = "auto";

/** Khoá idempotency lưu trong Payment.note (Payment KHÔNG có cột soDot). */
function autoPaymentMarker(soDot?: number | null): string {
  return soDot != null ? `[auto:order-installment:dot${soDot}]` : `[auto:order-confirm]`;
}

/**
 * S1 — Đảm bảo tồn tại 1 Payment(saleStatus=RECORDED) cho phần tiền của đơn:
 *  - đợt1 (recordInstallmentPlan), đợt2 (markInstallmentPaid), xác nhận đơn offline
 *    (changeOrderStatusAction →CONFIRMED) đều đi qua đây để Ledger-A (Payment) khớp Ledger-B.
 * IDEMPOTENT theo (orderId, soDot) — gọi lại KHÔNG tạo trùng (key = marker trong note).
 * Payment.centerId LUÔN suy ra (order.centerId → lead.centerId → actor.centerId), không để null.
 * Sau khi tạo, tự đẩy lead AWAITING_DECISION → REGISTERED (mở khoá PH-2 / S3).
 * CHẠY TRONG tx do call-site cung cấp (money-sensitive).
 */
export async function ensureOrderPaymentRecorded(
  tx: Tx,
  params: {
    orderId: string;
    soDot?: number | null;
    amount: number;
    leadId?: string | null;
    centerId?: string | null;
    actor: EnsurePaymentActor;
  },
): Promise<{ ok: true; created: boolean; paymentId: string | null } | Fail> {
  const { orderId, soDot, amount, leadId } = params;
  const marker = autoPaymentMarker(soDot);

  // Idempotency: đã có Payment auto cho (orderId, soDot) → trả lại, không tạo lại.
  const existing = await tx.payment.findFirst({
    where: { orderId, deletedAt: null, note: { contains: marker } },
    select: { id: true },
  });
  if (existing) return { ok: true, created: false, paymentId: existing.id };

  // Không có tiền để ghi (vd đợt2 = 0) → no-op thành công.
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: true, created: false, paymentId: null };
  }

  // Suy centerId: order → lead → actor; KHÔNG để null nếu còn nguồn khác.
  let centerId: string | null = params.centerId ?? null;
  if (!centerId && leadId) {
    const lead = await tx.lead.findUnique({ where: { id: leadId }, select: { centerId: true } });
    centerId = lead?.centerId ?? null;
  }
  if (!centerId) centerId = params.actor.centerId ?? null;

  // ⚠️ GẮN GHI DANH cho khoản thu tự động (06/09/2026).
  //
  // Cổng phụ huynh cộng tiền theo QUAN HỆ `Enrollment.payments` (lib/portal/billing.ts,
  // billing-student.ts, dashboard.ts). Khoản nào `enrollmentId = null` thì dù kế toán đã
  // xác nhận vẫn KHÔNG trừ vào công nợ của bất kỳ ghi danh nào — phụ huynh đóng đợt 2
  // xong mở portal ra vẫn thấy nợ nguyên.
  //
  // `linkRecordedPaymentsToEnrollments` chỉ chạy MỘT LẦN, trong `convert-lead-v2`. Mọi
  // khoản sinh SAU đó (đợt 2 qua markInstallmentPaid, xác nhận đơn offline, webhook
  // SePay) đều đi qua đúng hàm này và trước đây rơi vào khoảng trống ấy.
  //
  // Chỉ gắn khi KHÔNG MƠ HỒ — học viên của đơn có ĐÚNG MỘT ghi danh còn hiệu lực. Đơn
  // nhiều ghi danh phải chia theo `finalPrice` (đúng phép chia của
  // `linkRecordedPaymentsToEnrollments`), việc đó không làm lén ở đây; để null như cũ,
  // không tệ hơn hiện trạng và không bao giờ gắn nhầm sổ.
  const donHang = await tx.order.findUnique({
    where: { id: orderId },
    select: { studentId: true },
  });
  let enrollmentId: string | null = null;
  if (donHang?.studentId) {
    const ghiDanh = await tx.enrollment.findMany({
      where: { studentId: donHang.studentId, deletedAt: null },
      select: { id: true },
      take: 2,
    });
    if (ghiDanh.length === 1) enrollmentId = ghiDanh[0]!.id;
  }

  const now = new Date();
  const payment = await tx.payment.create({
    data: {
      orderId,
      enrollmentId,
      amount: Math.round(amount),
      method: AUTO_PAYMENT_METHOD,
      paidDate: now,
      note:
        soDot != null
          ? `Ghi nhận tự động đợt ${soDot} ${marker}`
          : `Ghi nhận tự động (xác nhận đơn) ${marker}`,
      saleStatus: "RECORDED",
      accountantStatus: "PENDING",
      recordedById: params.actor.id,
      centerId,
    },
    select: { id: true },
  });

  await writeAudit({
    actor: { id: params.actor.id, name: params.actor.name ?? "Hệ thống" },
    module: "finance",
    entityType: "Payment",
    entityId: payment.id,
    action: "CREATE",
    newValues: {
      amount: Math.round(amount),
      saleStatus: "RECORDED",
      source: "order-ledger",
      soDot: soDot ?? null,
    },
    orgUnitId: centerId,
    tx,
  });

  // S3 / PH-2 — ghi nhận tiền → lead tự lên 'Đã đăng ký' (mở khoá convert).
  if (leadId) {
    await maybeAdvanceLeadToRegistered(tx, { leadId, actor: params.actor });
  }

  return { ok: true, created: true, paymentId: payment.id };
}

/**
 * S3 — auto-advance lead CHO_QUYET_DINH → DA_DANG_KY khi đã ghi nhận thanh toán.
 * updateMany có guard (status=CHO_QUYET_DINH) → idempotent, không lùi/đụng status khác.
 * Trả true nếu vừa nâng cấp (để call-site biết có đổi).
 */
export async function maybeAdvanceLeadToRegistered(
  tx: Tx,
  params: { leadId: string; actor: EnsurePaymentActor },
): Promise<boolean> {
  const upd = await tx.lead.updateMany({
    where: { id: params.leadId, status: "CHO_QUYET_DINH", deletedAt: null },
    data: { status: "DA_DANG_KY" },
  });
  if (upd.count === 0) return false;
  // GĐ1 — `updateMany` ở trên là lượt claim atomic, giữ nguyên; chỉ nối thêm sổ.
  await recordLeadStatusChange({
    tx,
    leadId: params.leadId,
    from: "CHO_QUYET_DINH",
    to: "DA_DANG_KY",
    source: "payment",
    actorId: params.actor.id,
    actorName: params.actor.name ?? null,
  });
  await tx.leadActivity.create({
    data: {
      leadId: params.leadId,
      actorId: params.actor.id,
      actorName: params.actor.name ?? "Hệ thống",
      type: "STATUS_CHANGE",
      content: "Tự động: Chờ quyết định → Đã đăng ký (đã ghi nhận thanh toán)",
      metadata: { from: "CHO_QUYET_DINH", to: "DA_DANG_KY", auto: true },
    },
  });
  return true;
}

// ─── FIN-01 (Q1=A) — Gắn/chia khoản RECORDED của đơn vào Enrollment lúc convert ───
/**
 * Sau khi convert tạo Enrollment(s), GẮN các khoản `RECORDED` chưa gắn ghi danh của đơn
 * (theo order.leadId) vào ghi danh → `confirmPayment` sinh Receipt (scoped theo Enrollment)
 * chạy được, `getDebtRows` phản ánh đúng.
 *  - **1 ghi danh** → gắn nguyên khoản.
 *  - **Nhiều ghi danh (Q1=A)** → CHIA mỗi khoản theo `weights` (finalPrice từng ghi danh),
 *    bất biến tổng (allocateByWeight). Giữ id khoản gốc cho phần dương ĐẦU TIÊN, tạo Payment
 *    con cho các phần còn lại; phần = 0 (học bổng toàn phần) → bỏ qua (ghi danh đó không nợ).
 * KHÔNG auto-confirm — giữ tách vai kế toán (xác nhận tiền vào ngân hàng ở /payments, hoặc
 * trang Đối soát ngân hàng FIN-02). `enrollmentIds[i]` PHẢI tương ứng `weights[i]` (cùng thứ
 * tự students lúc convert). Chạy TRONG tx call-site cấp. Idempotent nhờ cổng convert
 * (atomic claim + idempotencyKey) — chỉ chạy 1 lần / lead.
 */
export async function linkRecordedPaymentsToEnrollments(
  tx: Tx,
  params: { leadId: string; enrollmentIds: string[]; weights: number[]; actor: AuditActor },
): Promise<{ linked: number; splitCreated: number }> {
  const { leadId, enrollmentIds, weights, actor } = params;
  if (enrollmentIds.length === 0) return { linked: 0, splitCreated: 0 };

  const recorded = await tx.payment.findMany({
    where: { saleStatus: "RECORDED", enrollmentId: null, deletedAt: null, order: { leadId } },
    select: {
      id: true, amount: true, orderId: true, method: true, paidDate: true,
      note: true, evidenceUrl: true, recordedById: true, centerId: true,
      accountantStatus: true,
    },
  });
  if (recorded.length === 0) return { linked: 0, splitCreated: 0 };

  // ⚠️ CHỐT CHẶN CỨNG (07/09/2026) — nhánh tách dưới đây SỬA `amount` của dòng gốc
  // (dòng 268: `tx.payment.update({ data: { amount: part } })`). Điều đó chỉ đúng khi
  // dòng còn là BẢN NHÁP: chưa qua kế toán, chưa đối soát sao kê, chưa vào bất kỳ tổng
  // nào của trục A. Đúng cùng một luận điểm với `updatePendingPayment`.
  //
  // Nếu một ngày nào đó dòng CONFIRMED lọt được vào đây thì việc sửa `amount` là làm sai
  // lệch tiền đã đối soát — âm thầm, giữa một transaction convert. Thà nổ ngay còn hơn.
  // Truy vấn trên vốn đã lọc `enrollmentId: null`, mà `confirmPayment` từ chối xác nhận
  // khoản chưa gắn ghi danh, nên về lý thuyết không thể xảy ra — chốt này canh đúng cái
  // "về lý thuyết" đó.
  const daXacNhan = recorded.filter((p) => p.accountantStatus === "CONFIRMED");
  if (daXacNhan.length > 0) {
    throw new Error(
      `linkRecordedPaymentsToEnrollments: gặp ${daXacNhan.length} khoản ĐÃ XÁC NHẬN ` +
        `(${daXacNhan.map((p) => p.id).join(", ")}). Nhánh tách sửa \`amount\` của dòng gốc ` +
        "nên TUYỆT ĐỐI không được chạm khoản đã đối soát — dùng adjustPayment.",
    );
  }

  // 1 ghi danh → gắn nguyên khoản (không tách).
  if (enrollmentIds.length === 1) {
    const r = await tx.payment.updateMany({
      where: { id: { in: recorded.map((p) => p.id) } },
      data: { enrollmentId: enrollmentIds[0]! },
    });
    return { linked: r.count, splitCreated: 0 };
  }

  // Nhiều ghi danh → chia theo finalPrice (bất biến tổng).
  const n = enrollmentIds.length;
  let splitCreated = 0;
  for (const p of recorded) {
    const parts = allocateByWeight(p.amount, weights);
    let reusedOriginal = false;
    for (let j = 0; j < n; j++) {
      const part = parts[j]!;
      if (part <= 0) continue; // ghi danh không được chia phần nào (finalPrice 0) → bỏ
      const note = `${(p.note ?? "").trim()} [tách ${j + 1}/${n}]`.trim();
      if (!reusedOriginal) {
        await tx.payment.update({
          where: { id: p.id },
          data: { enrollmentId: enrollmentIds[j]!, amount: part, note },
        });
        await writeAudit({
          actor, module: "finance", entityType: "Payment", entityId: p.id, action: "UPDATE",
          changedFields: ["amount", "enrollmentId"],
          oldValues: { amount: p.amount, enrollmentId: null },
          newValues: { amount: part, enrollmentId: enrollmentIds[j]!, source: "convert-split" },
          orgUnitId: p.centerId, tx,
        });
        reusedOriginal = true;
      } else {
        const created = await tx.payment.create({
          data: {
            orderId: p.orderId, enrollmentId: enrollmentIds[j]!, amount: part,
            method: p.method, paidDate: p.paidDate, evidenceUrl: p.evidenceUrl ?? null, note,
            saleStatus: "RECORDED", accountantStatus: "PENDING",
            recordedById: p.recordedById, centerId: p.centerId,
          },
          select: { id: true },
        });
        splitCreated++;
        await writeAudit({
          actor, module: "finance", entityType: "Payment", entityId: created.id, action: "CREATE",
          newValues: { amount: part, enrollmentId: enrollmentIds[j]!, source: "convert-split", splitFrom: p.id },
          orgUnitId: p.centerId, tx,
        });
      }
    }
  }
  return { linked: recorded.length, splitCreated };
}

// ─── AC1 — Sale ghi nhận khoản ────────────────────────────────────────────────
/**
 * Sale ghi nhận 1 khoản đã thu → saleStatus=RECORDED, accountantStatus=PENDING.
 * PH KHÔNG thấy (portal chỉ đọc CONFIRMED). Ghi audit CREATE.
 */
export async function recordPayment(input: {
  orderId: string;
  enrollmentId?: string | null;
  amount: number;
  method: string;
  paidDate: Date;
  evidenceUrl?: string | null;
  note?: string | null;
  recordedById: string;
  centerId: string | null;
  // S3 — leadId của order (nếu có) → auto-advance lead AWAITING_DECISION→REGISTERED trong cùng tx.
  leadId?: string | null;
}): Promise<Ok<{ paymentId: string }> | Fail> {
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    return fail("Số tiền phải lớn hơn 0");
  }
  const actor = await auditActor(input.recordedById);

  const payment = await db.$transaction(async (tx) => {
    const p = await tx.payment.create({
      data: {
        orderId: input.orderId,
        enrollmentId: input.enrollmentId ?? null,
        amount: input.amount,
        method: input.method,
        paidDate: input.paidDate,
        evidenceUrl: input.evidenceUrl ?? null,
        note: input.note ?? null,
        saleStatus: "RECORDED",
        accountantStatus: "PENDING",
        recordedById: input.recordedById,
        centerId: input.centerId,
      },
    });
    await writeAudit({
      actor,
      module: "finance",
      entityType: "Payment",
      entityId: p.id,
      action: "CREATE",
      newValues: {
        amount: input.amount,
        method: input.method,
        saleStatus: "RECORDED",
        accountantStatus: "PENDING",
      },
      orgUnitId: input.centerId,
      tx,
    });
    // S3 — ghi nhận tiền → lead tự lên 'Đã đăng ký' (idempotent guard trong helper).
    if (input.leadId) {
      await maybeAdvanceLeadToRegistered(tx, {
        leadId: input.leadId,
        actor: { id: input.recordedById, name: actor.name, centerId: input.centerId },
      });
    }
    return p;
  });

  return { ok: true, paymentId: payment.id };
}

// ─── AC2/AC8 — Kế toán xác nhận (idempotent) ──────────────────────────────────
/**
 * Kế toán xác nhận khoản → accountantStatus=CONFIRMED + confirmedAt; sinh 1 Receipt;
 * publish "payment.confirmed". IDEMPOTENT: đã CONFIRMED → no-op success (1 Receipt duy nhất
 * kể cả double-click). Khoản chưa gắn enrollment → không sinh phiếu được, báo lỗi.
 *
 * FIX-H8 — idempotency cấp REQUEST: nếu truyền `idempotencyKey` (uuid client tạo mỗi
 * lần bấm), trước khi xử lý sẽ thử đọc/ghi `IdempotencyKey` trong tx (mẫu convert-lead-v2).
 * Cùng key gửi lại → trả kết quả cũ, KHÔNG xử lý lại. Đây là lớp bổ sung — state-guard
 * `updateMany where accountantStatus=PENDING` (AC8) vẫn giữ và đã functionally idempotent.
 */
export async function confirmPayment(params: {
  paymentId: string;
  confirmedById: string;
  idempotencyKey?: string;
}): Promise<Ok<{ alreadyConfirmed: boolean; receiptId?: string }> | Fail> {
  // FIX-H8 — đã xử lý key này (request lặp) → trả kết quả cũ, không chạm lại nghiệp vụ.
  if (params.idempotencyKey) {
    const seen = await db.idempotencyKey.findUnique({ where: { key: params.idempotencyKey } });
    if (seen?.result) {
      const r = seen.result as { receiptId?: string | null };
      return { ok: true, alreadyConfirmed: true, receiptId: r.receiptId ?? undefined };
    }
  }

  const existing = await db.payment.findUnique({
    where: { id: params.paymentId },
    include: { receipts: { where: { deletedAt: null } } },
  });
  if (!existing) return fail("Không tìm thấy khoản thanh toán");

  // Idempotent: đã xác nhận → trả receipt hiện có, không tạo thêm.
  if (existing.accountantStatus === "CONFIRMED") {
    return { ok: true, alreadyConfirmed: true, receiptId: existing.receipts[0]?.id };
  }
  if (existing.accountantStatus !== "PENDING") {
    return fail("Khoản này không ở trạng thái chờ duyệt");
  }
  if (!existing.enrollmentId) {
    return fail("Khoản chưa gắn ghi danh, không thể sinh phiếu thu");
  }

  const actor = await auditActor(params.confirmedById);
  const centerCode = await centerCodeOf(existing.centerId);
  const now = new Date();

  const result = await db.$transaction(async (tx) => {
    // AC8 — guard chống đua: chỉ chuyển CONFIRMED khi đang PENDING (atomic).
    const upd = await tx.payment.updateMany({
      where: { id: existing.id, accountantStatus: "PENDING" },
      data: { accountantStatus: "CONFIRMED", confirmedById: params.confirmedById, confirmedAt: now },
    });
    if (upd.count === 0) {
      // Một request khác đã xác nhận đồng thời → trả receipt hiện có, KHÔNG sinh thêm.
      const r = await tx.receipt.findFirst({ where: { paymentId: existing.id } });
      // FIX-H8 — vẫn ghi key (nếu có) để request lặp sau trả đúng kết quả này.
      if (params.idempotencyKey) {
        await tx.idempotencyKey.create({
          data: { key: params.idempotencyKey, scope: "payment.confirm", result: { receiptId: r?.id ?? null } },
        });
      }
      return { receiptId: r?.id, raced: true };
    }
    const receipt = await issueReceipt({
      enrollmentId: existing.enrollmentId as string,
      paymentId: existing.id,
      issuedById: params.confirmedById,
      centerCode,
      tx,
      now,
    });
    await writeAudit({
      actor,
      module: "finance",
      entityType: "Payment",
      entityId: existing.id,
      action: "STATUS_CHANGE",
      oldValues: { accountantStatus: existing.accountantStatus },
      newValues: { accountantStatus: "CONFIRMED", receiptCode: receipt.code },
      orgUnitId: existing.centerId,
      tx,
    });
    await publishEvent(
      "payment.confirmed",
      {
        paymentId: existing.id,
        enrollmentId: existing.enrollmentId,
        orderId: existing.orderId,
        amount: existing.amount,
        receiptId: receipt.id,
        receiptCode: receipt.code,
      },
      { tx, dedupeKey: `payment.confirmed:${existing.id}` },
    );
    // FIX-H8 — ghi key trong CÙNG tx → double-submit sau trả kết quả này (không sinh Receipt thứ 2).
    if (params.idempotencyKey) {
      await tx.idempotencyKey.create({
        data: { key: params.idempotencyKey, scope: "payment.confirm", result: { receiptId: receipt.id } },
      });
    }
    return { receiptId: receipt.id, raced: false };
  });

  return { ok: true, alreadyConfirmed: result.raced, receiptId: result.receiptId };
}

// ─── AC3 — Kế toán từ chối (reason bắt buộc) ──────────────────────────────────
/**
 * Kế toán từ chối khoản → accountantStatus=REJECTED + rejectReason. Nếu khoản đã sinh
 * Receipt ACTIVE → thu hồi (status=VOID) + audit. reason BẮT BUỘC.
 */
export async function rejectPayment(params: {
  paymentId: string;
  confirmedById: string;
  reason: string;
  /** FIX-H9 — optimistic lock: Payment.updatedAt client đã thấy. Lệch → STALE_WRITE. */
  expectedUpdatedAt?: Date | string;
}): Promise<Ok<{ voidedReceiptIds: string[] }> | Fail> {
  if (!params.reason?.trim()) return fail("Lý do từ chối là bắt buộc");

  const existing = await db.payment.findUnique({
    where: { id: params.paymentId },
    include: { receipts: { where: { deletedAt: null } } },
  });
  if (!existing) return fail("Không tìm thấy khoản thanh toán");
  if (existing.accountantStatus === "REJECTED") {
    return { ok: true, voidedReceiptIds: [] };
  }

  const actor = await auditActor(params.confirmedById);
  const expectedAt = params.expectedUpdatedAt ? new Date(params.expectedUpdatedAt) : null;

  const result = await db.$transaction(async (tx) => {
    // FIX-H9 — ghi có điều kiện updatedAt; 0 row ⇒ người khác vừa sửa → STALE_WRITE.
    const upd = await tx.payment.updateMany({
      where: { id: existing.id, ...(expectedAt ? { updatedAt: expectedAt } : {}) },
      data: {
        accountantStatus: "REJECTED",
        confirmedById: params.confirmedById,
        confirmedAt: new Date(),
        rejectReason: params.reason.trim(),
      },
    });
    if (upd.count === 0) return { stale: true as const };

    const activeReceipts = existing.receipts.filter((r) => r.status === "ACTIVE");
    const voided: string[] = [];
    for (const r of activeReceipts) {
      await tx.receipt.update({ where: { id: r.id }, data: { status: "VOID" } });
      voided.push(r.id);
    }

    await writeAudit({
      actor,
      module: "finance",
      entityType: "Payment",
      entityId: existing.id,
      action: "STATUS_CHANGE",
      oldValues: { accountantStatus: existing.accountantStatus },
      newValues: { accountantStatus: "REJECTED", voidedReceipts: voided },
      reason: params.reason.trim(),
      orgUnitId: existing.centerId,
      tx,
    });
    // R7-17 (P0 gap) — phát event để PH/Sale được thông báo khoản bị từ chối.
    await publishEvent(
      "payment.rejected",
      {
        paymentId: existing.id,
        enrollmentId: existing.enrollmentId,
        orderId: existing.orderId,
        amount: existing.amount,
        reason: params.reason.trim(),
      },
      { tx, dedupeKey: `payment.rejected:${existing.id}` },
    );
    return { stale: false as const, voided };
  });

  if (result.stale) return fail(STALE_WRITE);
  return { ok: true, voidedReceiptIds: result.voided };
}

// ─── Điều chỉnh — BÚT TOÁN CỘNG THÊM, lưu DELTA (viết lại 07/09/2026) ─────────
/**
 * Điều chỉnh MỘT phiếu thu đã xác nhận.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Mô hình: CỘNG THÊM, không sửa đè
 *
 * Dòng `CONFIRMED` là tiền thật đã đối soát với sao kê ngân hàng ⇒ **bất biến**. Sửa số
 * của nó là sửa một sự kiện đã xảy ra. Nên điều chỉnh sinh một dòng MỚI mang phần
 * CHÊNH LỆCH, trỏ `adjustmentOfId` về phiếu gốc:
 *
 *     delta = correctAmount − (amount gốc + Σ amount các ADJUSTMENT đang trỏ vào nó)
 *
 * Cộng dồn các lần điều chỉnh trước vào công thức là có chủ đích: lần hai phải tính trên
 * kết quả của lần một, nếu không lần hai sẽ huỷ lần một một cách âm thầm.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Vì sao khoá theo `paymentId` chứ không phải `enrollmentId`
 *
 * Kế toán đang nhìn MỘT dòng phiếu thu và nói "dòng này phải là 3.500.000". Đó là thao
 * tác cấp phiếu thu. Một ghi danh trả góp có nhiều phiếu CONFIRMED (đợt 1, đợt 2), nên
 * nhận `enrollmentId` thì hàm phải TỰ ĐOÁN sửa phiếu nào — đoán sai ở đây là sai âm
 * thầm. Giao diện bắt buộc truyền id của đúng dòng đang sửa.
 *
 * `sumConfirmed(enrollmentId)` tự đúng theo, vì ADJUSTMENT là bút toán cộng thêm nằm
 * cùng ghi danh.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Vài điểm dễ vấp
 *
 * · `amount` của dòng ADJUSTMENT **được phép ÂM** — đó là cả điểm của delta. Ràng buộc
 *   DB duy nhất là `payment_amount_nonzero: CHECK (amount <> 0)`; cột là `integer` CÓ
 *   DẤU nên số âm lưu bình thường. Ràng buộc đó còn cộng hưởng với luật "delta = 0 thì
 *   không tạo bản ghi": code quên thì DB chặn.
 * · KHÔNG dùng lại mẹo khoá lạc quan cũ (ghi đè `updatedAt` của dòng gốc để chốt lock):
 *   nó là một UPDATE lên dòng gốc, đúng thứ mô hình này cấm. Thay bằng `SELECT … FOR
 *   UPDATE` — khoá HÀNG mà không đổi một cột nào, vẫn ngăn hai người điều chỉnh song
 *   song cùng tính delta trên một nền cũ.
 * · `reason` lưu vào `note` của chính dòng điều chỉnh: bảng `Payment` không có cột
 *   `reason` riêng, mà cổng phụ huynh (Bước 5) phải in được lý do ngay cạnh con số.
 *   AuditLog vẫn giữ bản sao ở trường `reason` của nó.
 */
export async function adjustPayment(params: {
  paymentId: string;
  /** SỐ ĐÚNG CUỐI CÙNG của DÒNG NÀY — không phải tổng của ghi danh, không phải delta. */
  correctAmount: number;
  reason: string;
  actorId: string;
  /** Optimistic lock: `Payment.updatedAt` client đã thấy. Lệch → STALE_WRITE. */
  expectedUpdatedAt?: Date | string;
}): Promise<Ok<{ adjustmentId: string; delta: number }> | Fail> {
  const reason = params.reason?.trim() ?? "";
  if (!reason) return fail("Lý do điều chỉnh là bắt buộc");

  const correctAmount = params.correctAmount;
  if (!Number.isInteger(correctAmount)) return fail("Số tiền đúng không hợp lệ");
  if (correctAmount < 0) return fail("Số tiền đúng không được âm");

  const original = await db.payment.findUnique({ where: { id: params.paymentId } });
  if (!original) return fail("Không tìm thấy khoản thanh toán");
  if (original.deletedAt) return fail("Khoản này đã bị xoá — không điều chỉnh được");

  // Chỉ điều chỉnh tiền ĐÃ ĐỐI SOÁT. Khoản còn PENDING là bản nháp: sửa thẳng bằng
  // `updatePendingPayment`, ép nó qua đường delta chỉ đẻ rác sổ.
  if (original.accountantStatus !== "CONFIRMED") {
    return fail(
      "Chỉ điều chỉnh được khoản ĐÃ XÁC NHẬN. Khoản đang chờ duyệt thì sửa trực tiếp.",
    );
  }
  // Không điều chỉnh chồng lên một bút toán điều chỉnh — mọi delta luôn trỏ về phiếu thu
  // gốc, nếu không chuỗi `adjustmentOfId` thành cây nhiều tầng và không ai cộng nổi.
  if (original.paymentType === "ADJUSTMENT") {
    return fail(
      "Đây là bút toán điều chỉnh, không phải phiếu thu. Điều chỉnh trên phiếu thu gốc.",
    );
  }
  if (!original.enrollmentId) {
    return fail("Khoản chưa gắn ghi danh — không kiểm được trần học phí");
  }
  const enrollmentId = original.enrollmentId;

  if (params.expectedUpdatedAt) {
    // So sánh KHÔNG ghi: dòng gốc phải bất biến, kể cả `updatedAt`.
    const expected = new Date(params.expectedUpdatedAt).getTime();
    if (original.updatedAt.getTime() !== expected) return fail(STALE_WRITE);
  }

  const actor = await auditActor(params.actorId);
  const now = new Date();

  const result = await db.$transaction(async (tx) => {
    // Khoá HÀNG gốc mà không sửa nó. Hai người cùng bấm điều chỉnh trên một phiếu sẽ nối
    // đuôi nhau, người sau tính delta trên kết quả của người trước.
    await tx.$queryRaw`SELECT id FROM "Payment" WHERE id = ${original.id} FOR UPDATE`;

    // Giá trị HIỆN TẠI của phiếu = số gốc + mọi điều chỉnh đã có.
    const daDieuChinh = await tx.payment.aggregate({
      where: { adjustmentOfId: original.id, paymentType: "ADJUSTMENT", deletedAt: null },
      _sum: { amount: true },
    });
    const hienTai = original.amount + (daDieuChinh._sum.amount ?? 0);
    const delta = correctAmount - hienTai;
    if (delta === 0) {
      return {
        loi:
          `Số tiền đúng đã bằng số hiện tại (${hienTai.toLocaleString("vi-VN")} đ) — ` +
          "không có gì để điều chỉnh.",
      };
    }

    // ── Trần: Σ CONFIRMED của GHI DANH sau điều chỉnh ────────────────────────
    // Điều chỉnh là thao tác cấp phiếu thu, nhưng trần là cấp ghi danh: một ghi danh
    // không thể thu quá học phí của nó, cũng không thể âm tiền.
    const ghiDanh = await tx.enrollment.findUnique({
      where: { id: enrollmentId },
      select: { finalPrice: true, tuition: true },
    });
    const tran = ghiDanh?.finalPrice ?? ghiDanh?.tuition ?? null;
    const daThu = await tx.payment.aggregate({
      where: { enrollmentId, accountantStatus: "CONFIRMED", deletedAt: null },
      _sum: { amount: true },
    });
    const tongSau = (daThu._sum.amount ?? 0) + delta;
    if (tongSau < 0) {
      return { loi: "Điều chỉnh làm tổng đã thu của ghi danh thành số âm." };
    }
    if (tran != null && tongSau > tran) {
      return {
        loi:
          `Điều chỉnh làm tổng đã thu (${tongSau.toLocaleString("vi-VN")} đ) vượt học phí ` +
          `của ghi danh (${tran.toLocaleString("vi-VN")} đ).`,
      };
    }

    const adj = await tx.payment.create({
      data: {
        orderId: original.orderId,
        enrollmentId,
        // DELTA — âm khi điều chỉnh giảm.
        amount: delta,
        method: original.method,
        paidDate: original.paidDate,
        // Lý do đi cùng bút toán để cổng phụ huynh in được ngay cạnh con số.
        note: reason,
        saleStatus: original.saleStatus,
        paymentType: "ADJUSTMENT",
        // Bút toán điều chỉnh do kế toán tạo ra, không qua vòng chờ duyệt thứ hai.
        accountantStatus: "CONFIRMED",
        recordedById: params.actorId,
        confirmedById: params.actorId,
        confirmedAt: now,
        adjustmentOfId: original.id,
        centerId: original.centerId,
      },
      select: { id: true },
    });

    await writeAudit({
      actor,
      module: "finance",
      entityType: "Payment",
      entityId: adj.id,
      action: "CREATE",
      newValues: {
        paymentType: "ADJUSTMENT",
        accountantStatus: "CONFIRMED",
        adjustmentOfId: original.id,
        soCu: hienTai,
        soDung: correctAmount,
        delta,
      },
      reason,
      orgUnitId: original.centerId,
      tx,
    });

    return { adjustmentId: adj.id, delta };
  });

  if ("loi" in result) return fail(result.loi as string);
  return {
    ok: true,
    adjustmentId: result.adjustmentId as string,
    delta: result.delta as number,
  };
}

// ─── Sửa khoản CÒN CHỜ DUYỆT — sửa tại chỗ, KHÔNG sinh bút toán ──────────────
/**
 * Sửa một khoản thu đang `PENDING`.
 *
 * Khoản chưa qua kế toán là BẢN NHÁP, chưa phải bút toán: sửa nháp không phải "điều
 * chỉnh". Ép nó đi đường delta sẽ đẻ ra một cặp dòng (số sai + dòng bù) cho một con số
 * chưa từng vào sổ — rác sổ, và bắt mọi báo cáo phải giải thích thêm một khái niệm.
 *
 * Ngược lại, KHÔNG cho hàm này chạm khoản đã `CONFIRMED`: đó là tiền đã đối soát với sao
 * kê, sửa tại chỗ là làm sai lệch một sự kiện đã xảy ra. Đường đúng là `adjustPayment`.
 */
export async function updatePendingPayment(params: {
  paymentId: string;
  actorId: string;
  amount?: number;
  method?: string;
  paidDate?: Date | string;
  note?: string | null;
  reason?: string;
  /** Optimistic lock: `Payment.updatedAt` client đã thấy. Lệch → STALE_WRITE. */
  expectedUpdatedAt?: Date | string;
}): Promise<Ok<{ paymentId: string }> | Fail> {
  const original = await db.payment.findUnique({ where: { id: params.paymentId } });
  if (!original) return fail("Không tìm thấy khoản thanh toán");
  if (original.deletedAt) return fail("Khoản này đã bị xoá");
  if (original.accountantStatus !== "PENDING") {
    return fail(
      "Chỉ sửa trực tiếp được khoản ĐANG CHỜ DUYỆT. Khoản đã xác nhận thì dùng Điều chỉnh.",
    );
  }
  if (params.amount !== undefined) {
    if (!Number.isInteger(params.amount)) return fail("Số tiền không hợp lệ");
    if (params.amount <= 0) return fail("Số tiền phải lớn hơn 0");
  }

  const actor = await auditActor(params.actorId);
  const expectedAt = params.expectedUpdatedAt ? new Date(params.expectedUpdatedAt) : null;

  const data: Prisma.PaymentUpdateManyMutationInput = {};
  if (params.amount !== undefined) data.amount = params.amount;
  if (params.method !== undefined) data.method = params.method;
  if (params.paidDate !== undefined) data.paidDate = new Date(params.paidDate);
  if (params.note !== undefined) data.note = params.note;
  if (Object.keys(data).length === 0) return fail("Không có gì để sửa.");

  const result = await db.$transaction(async (tx) => {
    // Khoản PENDING thì sửa đè là hợp lệ, nên vẫn dùng khoá lạc quan cũ: ghi có điều
    // kiện `updatedAt` + `accountantStatus`, 0 dòng ⇒ người khác vừa động vào (sửa hoặc
    // xác nhận) kể từ lúc client đọc.
    const upd = await tx.payment.updateMany({
      where: {
        id: original.id,
        accountantStatus: "PENDING",
        ...(expectedAt ? { updatedAt: expectedAt } : {}),
      },
      data,
    });
    if (upd.count === 0) return { stale: true };

    await writeAudit({
      actor,
      module: "finance",
      entityType: "Payment",
      entityId: original.id,
      action: "UPDATE",
      oldValues: {
        amount: original.amount,
        method: original.method,
        paidDate: original.paidDate,
        note: original.note,
      },
      newValues: data as Record<string, unknown>,
      reason: params.reason?.trim() || "Sửa khoản chờ duyệt",
      orgUnitId: original.centerId,
      tx,
    });
    return { stale: false };
  });

  if (result.stale) return fail(STALE_WRITE);
  return { ok: true, paymentId: original.id };
}

// ─── AC3 — Hoàn tiền (bút toán âm, không xóa gốc) ─────────────────────────────
/**
 * Hoàn tiền: tạo bản ghi MỚI amount ÂM, accountantStatus=REFUNDED, trỏ adjustmentOfId=gốc.
 * KHÔNG xóa gốc. reason BẮT BUỘC. (Công thức hoàn đầy đủ — out of scope R7-04.)
 */
export async function refundPayment(params: {
  paymentId: string;
  confirmedById: string;
  reason: string;
  amount?: number;
  /** FIX-H9 — optimistic lock trên bản gốc: Payment.updatedAt client đã thấy. */
  expectedUpdatedAt?: Date | string;
}): Promise<Ok<{ refundId: string }> | Fail> {
  if (!params.reason?.trim()) return fail("Lý do hoàn tiền là bắt buộc");

  const original = await db.payment.findUnique({ where: { id: params.paymentId } });
  if (!original) return fail("Không tìm thấy khoản thanh toán");

  // Số tiền hoàn (dương) — mặc định hoàn toàn bộ; bút toán ghi ÂM.
  const refundAbs = Math.abs(params.amount ?? original.amount);
  const negative = -refundAbs;

  const actor = await auditActor(params.confirmedById);
  const now = new Date();
  const expectedAt = params.expectedUpdatedAt ? new Date(params.expectedUpdatedAt) : null;

  const result = await db.$transaction(async (tx) => {
    // FIX-H9 — "touch" bản gốc có điều kiện updatedAt để chốt lock (chống hoàn 2 lần
    // trên cùng snapshot cũ khi 2 người thao tác song song).
    if (expectedAt) {
      const lock = await tx.payment.updateMany({
        where: { id: original.id, updatedAt: expectedAt },
        data: { updatedAt: now },
      });
      if (lock.count === 0) return { stale: true as const };
    }
    const ref = await tx.payment.create({
      data: {
        orderId: original.orderId,
        enrollmentId: original.enrollmentId,
        amount: negative,
        method: original.method,
        paidDate: now,
        note: original.note,
        saleStatus: original.saleStatus,
        accountantStatus: "REFUNDED",
        recordedById: original.recordedById,
        confirmedById: params.confirmedById,
        confirmedAt: now,
        adjustmentOfId: original.id,
        centerId: original.centerId,
      },
    });
    await writeAudit({
      actor,
      module: "finance",
      entityType: "Payment",
      entityId: ref.id,
      action: "CREATE",
      newValues: {
        accountantStatus: "REFUNDED",
        adjustmentOfId: original.id,
        amount: negative,
      },
      reason: params.reason.trim(),
      orgUnitId: original.centerId,
      tx,
    });
    return { stale: false as const, refundId: ref.id };
  });

  if (result.stale) return fail(STALE_WRITE);
  return { ok: true, refundId: result.refundId };
}
