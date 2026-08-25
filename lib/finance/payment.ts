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

  const now = new Date();
  const payment = await tx.payment.create({
    data: {
      orderId,
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
    },
  });
  if (recorded.length === 0) return { linked: 0, splitCreated: 0 };

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

// ─── AC3 — Điều chỉnh (không sửa bản gốc CONFIRMED) ───────────────────────────
/**
 * Điều chỉnh 1 khoản: KHÔNG mutate bản gốc — tạo bản ghi MỚI accountantStatus=ADJUSTED
 * trỏ adjustmentOfId=gốc. reason BẮT BUỘC. `amount` mới (mặc định = amount gốc).
 */
export async function adjustPayment(params: {
  paymentId: string;
  confirmedById: string;
  reason: string;
  amount?: number;
  method?: string;
  note?: string | null;
  /** FIX-H9 — optimistic lock trên bản gốc: Payment.updatedAt client đã thấy. */
  expectedUpdatedAt?: Date | string;
}): Promise<Ok<{ adjustmentId: string }> | Fail> {
  if (!params.reason?.trim()) return fail("Lý do điều chỉnh là bắt buộc");

  const original = await db.payment.findUnique({ where: { id: params.paymentId } });
  if (!original) return fail("Không tìm thấy khoản thanh toán");

  const amount = params.amount ?? original.amount;
  if (!Number.isFinite(amount)) return fail("Số tiền điều chỉnh không hợp lệ");
  if (amount <= 0) return fail("Số tiền điều chỉnh phải lớn hơn 0");

  const actor = await auditActor(params.confirmedById);
  const now = new Date();
  const expectedAt = params.expectedUpdatedAt ? new Date(params.expectedUpdatedAt) : null;

  const result = await db.$transaction(async (tx) => {
    // FIX-H9 — "touch" bản gốc có điều kiện updatedAt để chốt lock (bản gốc không đổi
    // nội dung nhưng updatedAt bump → chặn 2 người điều chỉnh trên cùng snapshot cũ).
    if (expectedAt) {
      const lock = await tx.payment.updateMany({
        where: { id: original.id, updatedAt: expectedAt },
        data: { updatedAt: now },
      });
      if (lock.count === 0) return { stale: true as const };
    }
    const adj = await tx.payment.create({
      data: {
        orderId: original.orderId,
        enrollmentId: original.enrollmentId,
        amount,
        method: params.method ?? original.method,
        paidDate: original.paidDate,
        note: params.note ?? original.note,
        saleStatus: original.saleStatus,
        accountantStatus: "ADJUSTED",
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
      entityId: adj.id,
      action: "CREATE",
      newValues: {
        accountantStatus: "ADJUSTED",
        adjustmentOfId: original.id,
        amount,
      },
      reason: params.reason.trim(),
      orgUnitId: original.centerId,
      tx,
    });
    return { stale: false as const, adjustmentId: adj.id };
  });

  if (result.stale) return fail(STALE_WRITE);
  return { ok: true, adjustmentId: result.adjustmentId };
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
