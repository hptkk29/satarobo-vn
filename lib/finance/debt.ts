// lib/finance/debt.ts — R2-06 công nợ + R2-03 confirm payment (Doc 15 §4.9) + R7-04 công nợ đa chiều.
//
// HT (27/08/2026) — công nợ nay đọc qua ĐÚNG công thức thực thu (`lib/finance/thuc-thu.ts`,
// quyết định B3 24/08). Trước đó nó lọc cứng `accountantStatus = "CONFIRMED"`, mà
// `refundPayment()` ghi bút toán ÂM ở trạng thái REFUNDED và `adjustPayment()` ghi bản
// mới ở trạng thái ADJUSTED (bản gốc giữ nguyên) ⇒ hoàn tiền và điều chỉnh đều rơi ra
// ngoài phép cộng. KHÔNG viết công thức thứ hai ở đây.
import type { Order } from "@prisma/client";
import { db } from "@/lib/db";
import { writeAudit, type AuditActor } from "@/lib/audit/audit-log";
import { enqueueDebtReminder } from "@/lib/email/triggers";
import type { ScopedDb } from "@/lib/actions/factory";
import {
  WHERE_THUC_THU,
  SELECT_THUC_THU,
  tinhThucThu,
  type ThucThuButToan,
} from "@/lib/finance/thuc-thu";

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
 * Ghi danh đã RỜI LỚP giữa chừng. Với những trạng thái này `finalPrice` KHÔNG còn là
 * "số phải đóng": học viên đã ra khỏi lớp, phần phải trả được chốt qua luồng hoàn tiền
 * (`RefundRequest`) chứ không phải qua bảng công nợ. Hệ thống không hạ `finalPrice` khi
 * gỡ lớp — xem `lib/students/remove-from-classes.ts` (cố ý đổi `status`, KHÔNG set
 * `deletedAt`, để giữ nguyên sổ sách).
 *
 * ⚠️ COMPLETED KHÔNG nằm ở đây: học xong thì học phí vẫn phải đóng đủ.
 */
export const TRANG_THAI_ROI_LOP = ["WITHDREW", "TRANSFERRED", "CANCELLED"] as const;

/**
 * Công nợ 1 ghi danh = finalPrice − ĐÃ THU. THUẦN.
 * Có thể ÂM (đóng thừa) — trả raw, caller tự bucket/hiển thị. finalPrice null → 0.
 *
 * "Đã thu" đi qua `tinhThucThu` (`lib/finance/thuc-thu.ts`): CONFIRMED cộng vào,
 * REFUNDED cộng vào (số âm ⇒ trừ ra), ADJUSTED cộng vào và LOẠI bản gốc nó thay thế.
 *
 * ⚠️ MỘT NGOẠI LỆ, VÀ CHỈ MỘT: với ghi danh đã RỜI LỚP, bút toán HOÀN không được tính
 * vào phép trừ. Vì sao — `getDebtRows` lọc `deletedAt: null` nhưng KHÔNG lọc `status`,
 * nên ghi danh của học viên đã nghỉ vẫn nằm nguyên trong bảng công nợ. Trước đợt vá, em
 * nghỉ-học-hoàn-đủ có công nợ 0 (vì bút toán âm bị bỏ qua). Nếu lấy thẳng thực thu ròng
 * làm công nợ, em đó bỗng "nợ" đúng số vừa được hoàn và hệ thống đi đòi tiền một người
 * đã được trả lại tiền — đổi một lỗi im lặng lấy một lỗi ồn ào hơn, ngay trên màn phụ
 * huynh. Ngoại lệ KHÔNG áp cho bút toán ĐIỀU CHỈNH: sửa số ghi nhầm thì công nợ phải
 * theo số đúng, dù học viên còn học hay đã nghỉ.
 *
 * `enrollmentStatus` là tham số BẮT BUỘC (không mặc định): quên truyền = TypeScript đỏ,
 * chứ không phải âm thầm chạy nhánh sai.
 */
export function computeEnrollmentDebt(
  finalPrice: number | null,
  butToan: ThucThuButToan[],
  enrollmentStatus: string | null,
): number {
  const daRoiLop =
    enrollmentStatus != null &&
    (TRANG_THAI_ROI_LOP as readonly string[]).includes(enrollmentStatus);
  const rows = daRoiLop ? butToan.filter((p) => p.accountantStatus !== "REFUNDED") : butToan;
  return (finalPrice ?? 0) - tinhThucThu(rows);
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
  courseName: string | null;
  centerId: string | null;
  finalPrice: number;
  /** Đã thu RÒNG (thực thu): đã trừ khoản hoàn, đã theo bản điều chỉnh mới nhất. */
  confirmedPaid: number;
  debt: number;
};

/**
 * Tổng hợp công nợ theo ghi danh — "đã thu" đi qua công thức thực thu dùng chung
 * (`WHERE_THUC_THU`, HT 27/08/2026), KHÔNG còn lọc cứng CONFIRMED.
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
      status: true,
      studentId: true,
      student: { select: { name: true } },
      course: { select: { name: true } },
      class: { select: { centerId: true } },
      // FIX-C3: nested include không auto-scope → tự lọc payment đã xóa.
      // HT: `WHERE_THUC_THU` đã bao gồm `deletedAt: null` + loại bản gốc bị điều chỉnh
      // thay thế (nhánh quan hệ `adjustments.none`). `butToanThucThu` chạy lại ở tầng
      // hàm thuần bên trong `computeEnrollmentDebt` — lớp chắn, không phải bước thứ hai.
      payments: { where: WHERE_THUC_THU, select: SELECT_THUC_THU },
    },
  });

  return enrollments.map((e) => {
    const finalPrice = e.finalPrice ?? e.tuition ?? 0;
    const debt = computeEnrollmentDebt(finalPrice, e.payments, e.status);
    return {
      enrollmentId: e.id,
      studentId: e.studentId,
      studentName: e.student?.name ?? null,
      courseName: e.course?.name ?? null,
      centerId: e.class?.centerId ?? null,
      finalPrice,
      confirmedPaid: tinhThucThu(e.payments),
      debt,
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

/**
 * Số ngày nhắc trước hạn MẶC ĐỊNH cho trả góp khi installment không override
 * (`reminderDays = null`). Khớp default của SystemSetting `finance.debtReminderDaysBefore`
 * (= 14). Caller (cron) có thể truyền `defaultReminderDays` từ getSetting để override.
 */
const DEFAULT_INSTALLMENT_REMINDER_DAYS = 14;

/**
 * R7 P2 — nhắc nợ cho ĐỢT TRẢ GÓP (OrderInstallment PENDING) qua email/Resend.
 * Bổ sung cho remindOverdueSingleOrders (đơn lẻ) — phủ luôn cả đợt 1 lẫn đợt 2.
 * Mỗi đợt đến hạn nhắc khi `dueDate − (reminderDays ?? default) ≤ now`, gửi qua
 * enqueueDebtReminder rồi set `lastReminderAt = now`. Chống spam: tối đa 1 nhắc/ngày
 * (lastReminderAt cùng ngày UTC với now → skip). Đợt không có email → skip.
 */
export async function remindOverdueInstallments(
  opts: { now?: Date; defaultReminderDays?: number } = {},
): Promise<{ found: number; sent: number; skipped: number }> {
  const now = opts.now ?? new Date();
  const defaultDays = opts.defaultReminderDays ?? DEFAULT_INSTALLMENT_REMINDER_DAYS;
  const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  const installments = await db.orderInstallment.findMany({
    where: {
      status: "PENDING",
      dueDate: { not: null },
      order: { status: { notIn: ["CANCELLED", "REFUNDED"] } },
    },
    select: {
      id: true,
      amount: true,
      dueDate: true,
      reminderDays: true,
      lastReminderAt: true,
      order: { select: { id: true, code: true, customerName: true, customerEmail: true } },
    },
  });

  let found = 0;
  let sent = 0;
  let skipped = 0;
  for (const inst of installments) {
    const days = effectiveReminderDays(inst.reminderDays, defaultDays);
    if (!isReminderDue(inst.dueDate, days, now)) continue; // chưa đến mốc nhắc
    found++;

    // Chống spam: đã nhắc trong ngày UTC hôm nay → skip.
    if (inst.lastReminderAt && inst.lastReminderAt >= startOfToday) { skipped++; continue; }

    const email = inst.order.customerEmail?.trim() || null;
    if (!email) { skipped++; continue; } // không có email → skip

    await enqueueDebtReminder({
      to: email,
      customerName: inst.order.customerName,
      orderId: inst.order.id,
      orderCode: inst.order.code,
      amount: inst.amount,
    });
    await db.orderInstallment.update({ where: { id: inst.id }, data: { lastReminderAt: now } });
    sent++;
  }
  return { found, sent, skipped };
}
