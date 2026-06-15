// lib/finance/payment.ts — R7-04: khoản thanh toán 2 tầng (Sale ghi nhận ↔ Kế toán xác nhận).
// MỌI mutation tiền chạy trong db.$transaction. Audit before/after; reject/adjust/refund
// BẮT BUỘC reason. Hàm THUẦN role-logic (can() do tầng action lo) — chỉ xử lý nghiệp vụ.
import { db } from "@/lib/db";
import { writeAudit, type AuditActor } from "@/lib/audit/audit-log";
import { publishEvent } from "@/lib/events/publish";
import { issueReceipt } from "@/lib/finance/receipt";

/** Kết quả chung — { ok } + field phụ; lỗi → { ok:false, error }. */
type Ok<T> = { ok: true } & T;
type Fail = { ok: false; error: string };

function fail(error: string): Fail {
  return { ok: false, error };
}

/** Resolve actor cho audit (chỉ có id → tra tên; null → Hệ thống). */
async function auditActor(userId: string | null | undefined): Promise<AuditActor> {
  if (!userId) return { id: null, name: "Hệ thống" };
  const u = await db.user.findUnique({ where: { id: userId }, select: { name: true } });
  return { id: userId, name: u?.name ?? userId };
}

/** Tra mã cơ sở (OrgUnit.code) cho mã phiếu thu. */
async function centerCodeOf(centerId: string | null | undefined): Promise<string> {
  if (!centerId) return "SR";
  const ou = await db.orgUnit.findUnique({ where: { id: centerId }, select: { code: true } });
  return ou?.code ?? "SR";
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
    return p;
  });

  return { ok: true, paymentId: payment.id };
}

// ─── AC2/AC8 — Kế toán xác nhận (idempotent) ──────────────────────────────────
/**
 * Kế toán xác nhận khoản → accountantStatus=CONFIRMED + confirmedAt; sinh 1 Receipt;
 * publish "payment.confirmed". IDEMPOTENT: đã CONFIRMED → no-op success (1 Receipt duy nhất
 * kể cả double-click). Khoản chưa gắn enrollment → không sinh phiếu được, báo lỗi.
 */
export async function confirmPayment(params: {
  paymentId: string;
  confirmedById: string;
}): Promise<Ok<{ alreadyConfirmed: boolean; receiptId?: string }> | Fail> {
  const existing = await db.payment.findUnique({
    where: { id: params.paymentId },
    include: { receipts: true },
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

  const receiptId = await db.$transaction(async (tx) => {
    await tx.payment.update({
      where: { id: existing.id },
      data: { accountantStatus: "CONFIRMED", confirmedById: params.confirmedById, confirmedAt: now },
    });
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
    return receipt.id;
  });

  return { ok: true, alreadyConfirmed: false, receiptId };
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
}): Promise<Ok<{ voidedReceiptIds: string[] }> | Fail> {
  if (!params.reason?.trim()) return fail("Lý do từ chối là bắt buộc");

  const existing = await db.payment.findUnique({
    where: { id: params.paymentId },
    include: { receipts: true },
  });
  if (!existing) return fail("Không tìm thấy khoản thanh toán");
  if (existing.accountantStatus === "REJECTED") {
    return { ok: true, voidedReceiptIds: [] };
  }

  const actor = await auditActor(params.confirmedById);

  const voidedReceiptIds = await db.$transaction(async (tx) => {
    await tx.payment.update({
      where: { id: existing.id },
      data: {
        accountantStatus: "REJECTED",
        confirmedById: params.confirmedById,
        confirmedAt: new Date(),
        rejectReason: params.reason.trim(),
      },
    });

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
    return voided;
  });

  return { ok: true, voidedReceiptIds };
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
}): Promise<Ok<{ adjustmentId: string }> | Fail> {
  if (!params.reason?.trim()) return fail("Lý do điều chỉnh là bắt buộc");

  const original = await db.payment.findUnique({ where: { id: params.paymentId } });
  if (!original) return fail("Không tìm thấy khoản thanh toán");

  const amount = params.amount ?? original.amount;
  if (!Number.isFinite(amount)) return fail("Số tiền điều chỉnh không hợp lệ");

  const actor = await auditActor(params.confirmedById);
  const now = new Date();

  const adjustmentId = await db.$transaction(async (tx) => {
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
    return adj.id;
  });

  return { ok: true, adjustmentId };
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
}): Promise<Ok<{ refundId: string }> | Fail> {
  if (!params.reason?.trim()) return fail("Lý do hoàn tiền là bắt buộc");

  const original = await db.payment.findUnique({ where: { id: params.paymentId } });
  if (!original) return fail("Không tìm thấy khoản thanh toán");

  // Số tiền hoàn (dương) — mặc định hoàn toàn bộ; bút toán ghi ÂM.
  const refundAbs = Math.abs(params.amount ?? original.amount);
  const negative = -refundAbs;

  const actor = await auditActor(params.confirmedById);
  const now = new Date();

  const refundId = await db.$transaction(async (tx) => {
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
    return ref.id;
  });

  return { ok: true, refundId };
}
