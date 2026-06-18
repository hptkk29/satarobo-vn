// lib/finance/debt.ts — R2-06 công nợ + R2-03 confirm payment (Doc 15 §4.9) + R7-04 công nợ đa chiều.
import type { Order } from "@prisma/client";
import { db } from "@/lib/db";
import { writeAudit, type AuditActor } from "@/lib/audit/audit-log";
import { enqueueDebtReminder } from "@/lib/email/triggers";
import type { ScopedDb } from "@/lib/actions/factory";

/** Công nợ = tổng hoá đơn − đã trả (không âm). THUẦN (C6.1). */
export function computeDebt(totalAmount: number, paidAmount: number): number {
  return Math.max(0, totalAmount - paidAmount);
}

/** Đã trả của 1 order (CONFIRMED/COMPLETED = trả đủ; còn lại = 0). THUẦN. */
export function paidOf(order: Pick<Order, "status" | "totalAmount">): number {
  return order.status === "CONFIRMED" || order.status === "COMPLETED" ? order.totalAmount : 0;
}

export class PaymentError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "PaymentError";
    this.code = code;
  }
}

/** C3.3/C3.4 — kế toán xác nhận thanh toán. Idempotent: gọi 2 lần → 1 kết quả. */
export async function confirmOrderPayment(
  actor: AuditActor,
  orderId: string,
  reason?: string,
): Promise<{ order: Order; alreadyConfirmed: boolean }> {
  const order = await db.order.findUnique({ where: { id: orderId } });
  if (!order) throw new PaymentError("ORDER_NOT_FOUND", "Không tìm thấy hoá đơn.");
  if (order.status === "CONFIRMED" || order.status === "COMPLETED") {
    return { order, alreadyConfirmed: true }; // idempotent
  }
  const updated = await db.order.update({
    where: { id: orderId },
    data: { status: "CONFIRMED", paidAt: new Date() },
  });
  await writeAudit({
    actor, module: "finance", entityType: "Order", entityId: order.id, action: "STATUS_CHANGE",
    oldValues: { status: order.status }, newValues: { status: "CONFIRMED" }, reason, orgUnitId: order.centerId,
  });
  return { order: updated, alreadyConfirmed: false };
}

// ═══ R7-04 — công nợ đa chiều theo Enrollment (Payment 2 tầng) ═════════════════

/**
 * Công nợ 1 ghi danh = finalPrice − Σ amount(Payment CONFIRMED). THUẦN.
 * Có thể ÂM (đóng thừa) — trả raw, caller tự bucket/hiển thị. finalPrice null → 0.
 */
export function computeEnrollmentDebt(
  finalPrice: number | null,
  confirmedPayments: { amount: number }[],
): number {
  const paid = confirmedPayments.reduce((s, p) => s + p.amount, 0);
  return (finalPrice ?? 0) - paid;
}

const DAY_MS = 86_400_000;

/** Bucket quá hạn theo dueDate vs now. THUẦN. dueDate null / chưa tới hạn → "none". */
export function overdueBucket(dueDate: Date | null, now: Date): "none" | "1-7" | "8-30" | ">30" {
  if (!dueDate) return "none";
  const overdueDays = Math.floor((now.getTime() - dueDate.getTime()) / DAY_MS);
  if (overdueDays <= 0) return "none";
  if (overdueDays <= 7) return "1-7";
  if (overdueDays <= 30) return "8-30";
  return ">30";
}

/** Số ngày nhắc hiệu lực: per-row override → fallback default setting. THUẦN. */
export function effectiveReminderDays(reminderDays: number | null, defaultDays: number): number {
  return reminderDays ?? defaultDays;
}

/**
 * Có đến hạn nhắc chưa: nhắc khi `dueDate − effectiveDays ≤ now`. THUẦN.
 * (Chống spam 1/ngày là lastReminderAt — tách khỏi quyết định này.)
 */
export function isReminderDue(dueDate: Date | null, effectiveDays: number, now: Date): boolean {
  if (!dueDate) return false;
  const remindFrom = dueDate.getTime() - effectiveDays * DAY_MS;
  return remindFrom <= now.getTime();
}

/** 1 dòng công nợ theo ghi danh (cho trang /admin/cong-no). */
export type DebtRow = {
  enrollmentId: string;
  studentId: string | null;
  studentName: string | null;
  centerId: string | null;
  finalPrice: number;
  confirmedPaid: number;
  debt: number;
};

/**
 * Tổng hợp công nợ theo ghi danh — CHỈ tính Payment accountantStatus=CONFIRMED.
 * Nhận client đã scope (tầng action truyền scopedDb(actor) → cách ly cơ sở tự động).
 */
export async function getDebtRows(
  scopedDbClient: ScopedDb,
  filters?: { enrollmentId?: string; studentId?: string },
): Promise<DebtRow[]> {
  // G4 fix: lái theo ENROLLMENT (không theo payment) để ghi danh CHƯA đóng đồng nào
  // — nợ nhiều nhất — vẫn hiện. Cách ly cơ sở: lọc theo lớp NẰM TRONG scope của actor
  // (Class là SCOPED_MODEL → scopedDbClient.class.findMany tự inject centerId).
  const scopedClasses = await scopedDbClient.class.findMany({ select: { id: true } });
  const classIds = scopedClasses.map((c) => c.id);
  if (classIds.length === 0) return [];

  const enrollments = await db.enrollment.findMany({
    where: {
      classId: { in: classIds },
      finalPrice: { not: null }, // chỉ ghi danh đã chốt giá (snapshot tại convert R7-05)
      deletedAt: null, // FIX-C3
      ...(filters?.enrollmentId ? { id: filters.enrollmentId } : {}),
      ...(filters?.studentId ? { studentId: filters.studentId } : {}),
    },
    select: {
      id: true,
      finalPrice: true,
      tuition: true,
      studentId: true,
      student: { select: { name: true } },
      class: { select: { centerId: true } },
      // FIX-C3: nested include không auto-scope → tự lọc payment đã xóa.
      payments: { where: { accountantStatus: "CONFIRMED", deletedAt: null }, select: { amount: true } },
    },
  });

  return enrollments.map((e) => {
    const finalPrice = e.finalPrice ?? e.tuition ?? 0;
    const confirmedPaid = e.payments.reduce((s, p) => s + p.amount, 0);
    return {
      enrollmentId: e.id,
      studentId: e.studentId,
      studentName: e.student?.name ?? null,
      centerId: e.class?.centerId ?? null,
      finalPrice,
      confirmedPaid,
      debt: finalPrice - confirmedPaid,
    };
  });
}

/** Order quá hạn chưa thanh toán (cho cron nhắc nợ C6.2). */
export async function getOverdueOrders(opts: { olderThanDays?: number; now?: Date } = {}): Promise<Order[]> {
  const now = opts.now ?? new Date();
  const cutoff = new Date(now.getTime() - (opts.olderThanDays ?? 7) * 86_400_000);
  return db.order.findMany({
    where: { status: "PENDING_PAYMENT", createdAt: { lt: cutoff }, deletedAt: null }, // FIX-C3
    orderBy: { createdAt: "asc" },
  });
}

/**
 * C6.3 — nhắc nợ cho ĐƠN LẺ (trả 1 lần, không trả góp) qua email/Resend.
 * Bỏ qua đơn có installments (đã được /api/cron/debt-reminder lo). Chống spam 1 lần/ngày.
 */
export async function remindOverdueSingleOrders(
  opts: { olderThanDays?: number; now?: Date } = {},
): Promise<{ found: number; sent: number; skipped: number }> {
  const now = opts.now ?? new Date();
  const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const orders = await getOverdueOrders({ olderThanDays: opts.olderThanDays, now });

  let sent = 0;
  let skipped = 0;
  for (const o of orders) {
    if (!o.customerEmail) { skipped++; continue; }
    const installmentCount = await db.orderInstallment.count({ where: { orderId: o.id } });
    if (installmentCount > 0) { skipped++; continue; } // trả góp → cron installment lo

    const remindedToday = await db.emailQueue.findFirst({
      where: { contextType: "DEBT_REMINDER_ORDER", contextId: o.id, createdAt: { gte: startOfToday } },
      select: { id: true },
    });
    if (remindedToday) { skipped++; continue; } // chống spam 1/ngày

    await enqueueDebtReminder({
      to: o.customerEmail,
      customerName: o.customerName,
      orderId: o.id,
      orderCode: o.code,
      amount: o.totalAmount,
    });
    sent++;
  }
  return { found: orders.length, sent, skipped };
}
