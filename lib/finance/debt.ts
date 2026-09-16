// lib/finance/debt.ts — R2-06 công nợ + R2-03 confirm payment (Doc 15 §4.9) + R7-04 công nợ đa chiều.
import type { Order } from "@prisma/client";
import { db } from "@/lib/db";
import { writeAudit, type AuditActor } from "@/lib/audit/audit-log";
import { enqueueDebtReminder } from "@/lib/email/triggers";
// TRỤC B — hằng điều kiện "đã ghi nhận". Import để KHÔNG gõ tay "RECORDED" ở đây:
// mỗi lần gõ tay là một bản sao thứ hai của định nghĩa "đã thu".
import { laKhoanDaGhiNhan } from "@/lib/finance/ghi-nhan";
import { chanGuiRaNgoai, donNhiemTheoDon } from "@/lib/orders/don-nhiem";
import type { ScopedDb } from "@/lib/actions/factory";

// ĐỊNH NGHĨA dời sang `debt-pure.ts` (14/09/2026) vì file này import `@/lib/db`: mọi
// component client dùng lại `computeDebt` đều kéo PrismaClient vào bundle trình duyệt và
// nổ lúc chạy — typecheck/lint/depcruise đều xanh. Re-export để ~30 chỗ gọi cũ không đổi.
export { computeDebt } from "@/lib/finance/debt-pure";

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

// ─────────────────────────────────────────────────────────────────────────────
// TRỤC A — "tiền ĐÃ XÁC NHẬN". Định nghĩa nằm ở ĐÚNG MỘT CHỖ: dưới đây.
//
// Vì sao gom (07/09/2026): cùng một phép cộng từng được chép tay ở BỐN nơi, mỗi nơi
// một kiểu — `debt.ts` (hàm thuần), `debt.ts:getDebtRows` (tự reduce, không gọi hàm
// thuần), `portal/billing.ts` và `portal/billing-student.ts` (lọc trong JS trên truy vấn
// chỉ lọc `deletedAt`). Bốn bản đó lệch nhau là chuyện sớm muộn, và tiền lệch thì không
// ai phát hiện bằng mắt.
//
// ⚠️ KHÔNG lọc theo `paymentType`: bút toán ADJUSTMENT LUÔN được cộng. Đó là cả điểm của
// mô hình delta — dòng gốc giữ số cũ, dòng điều chỉnh mang phần chênh lệch, tổng mới là
// con số đúng. Lọc `paymentType = 'PAYMENT'` ở bất kỳ đâu là ném điều chỉnh đi lần nữa,
// đúng cái lỗi cả đợt này đang sửa.
//
// ⚠️ Đây là TRỤC A. Trục B ("đã ghi nhận", `saleStatus = RECORDED` — mã QR, webhook
// SePay, tin ZNS, cổng chốt lead) là một câu hỏi KHÁC và có khoá khác (đơn, không phải
// ghi danh). Không gộp hai trục: chênh lệch giữa chúng chính là tín hiệu phát hiện
// webhook hỏng.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Điều kiện `where` cho MỌI truy vấn cộng tiền đã xác nhận.
 * Dùng thẳng trong `where` của Prisma, kể cả trong quan hệ lồng (`payments: { where }`).
 */
export const KHOAN_DA_XAC_NHAN = {
  accountantStatus: "CONFIRMED",
  deletedAt: null,
} as const;

/**
 * Bản JS của cùng điều kiện — cho chỗ đã nạp sẵn cả danh sách rồi lọc trong bộ nhớ
 * (vd trang Học phí còn phải đếm khoản PENDING/REJECTED nên không lọc được ở query).
 */
export function laKhoanDaXacNhan(p: {
  accountantStatus: string;
  deletedAt?: Date | null;
}): boolean {
  return p.accountantStatus === "CONFIRMED" && !p.deletedAt;
}

/** Σ tiền đã xác nhận từ danh sách ĐÃ LỌC sẵn. THUẦN. */
export function tongDaXacNhan(confirmedPayments: { amount: number }[]): number {
  return confirmedPayments.reduce((s, p) => s + p.amount, 0);
}

/**
 * Công nợ 1 ghi danh = finalPrice − Σ amount(Payment CONFIRMED). THUẦN.
 * Có thể ÂM (đóng thừa) — trả raw, caller tự bucket/hiển thị. finalPrice null → 0.
 */
export function computeEnrollmentDebt(
  finalPrice: number | null,
  confirmedPayments: { amount: number }[],
): number {
  return (finalPrice ?? 0) - tongDaXacNhan(confirmedPayments);
}

/**
 * Σ tiền ĐÃ XÁC NHẬN của một ghi danh — đọc thẳng DB.
 *
 * Khoá là `enrollmentId` và điều đó an toàn: `confirmPayment` từ chối xác nhận khoản
 * chưa gắn ghi danh, nên không có đồng tiền đã xác nhận nào nằm ngoài tầm với.
 */
export async function sumConfirmed(enrollmentId: string): Promise<number> {
  const r = await db.payment.aggregate({
    where: { enrollmentId, ...KHOAN_DA_XAC_NHAN },
    _sum: { amount: true },
  });
  return r._sum.amount ?? 0;
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
  confirmedPaid: number;
  debt: number;
  /**
   * TRỤC B — Σ `Payment` có `saleStatus = RECORDED`. Tiền vừa nhập từ sheet nằm ở đây và
   * nó CHƯA vào `confirmedPaid` cho tới khi kế toán xác nhận ở /payments.
   *
   * Thêm 14/09/2026, ADDITIVE: `debt` và `confirmedPaid` giữ nguyên công thức cũ nên hai
   * caller còn lại (`manager-dashboard`, nhóm tổng của /cong-no) không đổi một con số nào.
   */
  recordedPaid: number;
  /**
   * Ghi danh CHƯA có `finalPrice`. Chỉ có thể `true` khi người gọi truyền
   * `keCaChuaChotGia: true`; mặc định hàm vẫn lọc bỏ như trước.
   */
  chuaChotGia: boolean;
};

/**
 * Tổng hợp công nợ theo ghi danh — CHỈ tính Payment accountantStatus=CONFIRMED.
 * Nhận client đã scope (tầng action truyền scopedDb(actor) → cách ly cơ sở tự động).
 */
export async function getDebtRows(
  scopedDbClient: ScopedDb,
  filters?: {
    enrollmentId?: string;
    studentId?: string;
    /**
     * Lấy CẢ ghi danh chưa chốt giá (`finalPrice = null`).
     *
     * ⚠️ MẶC ĐỊNH `false` — giữ nguyên hành vi cũ cho hai caller đang có. Bật mặc định là
     * đổi con số tổng nợ trên dashboard quản lý mà không ai yêu cầu.
     *
     * Nhưng nhóm này KHÔNG được quên: nhà đã đóng tiền mà hệ thống không biết phải đóng
     * bao nhiêu ⇒ không ai nợ ai trong sổ, không màn nào kêu. Màn đối soát học phí bật cờ
     * này và hiện chúng thành một trạng thái riêng.
     */
    keCaChuaChotGia?: boolean;
  },
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
      // Mặc định chỉ ghi danh ĐÃ chốt giá (snapshot tại convert R7-05); `keCaChuaChotGia`
      // mở thêm nhóm chưa chốt — xem chú thích ở tham số.
      ...(filters?.keCaChuaChotGia ? {} : { finalPrice: { not: null } }),
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
      course: { select: { name: true } },
      class: { select: { centerId: true } },
      // FIX-C3: nested include không auto-scope → tự lọc payment đã xóa.
      //
      // ⚠️ NẠP CẢ HAI TRỤC TRONG MỘT LƯỢT, lọc trong bộ nhớ. Prisma KHÔNG cho đặt bí danh
      // cho cùng một quan hệ hai lần, nên không thể viết `payments` (trục A) cạnh
      // `khoanDaGhiNhan` (trục B). Lấy khoản còn sống rồi lọc bằng chính hai hằng điều
      // kiện của repo — KHÔNG gõ tay `"CONFIRMED"`/`"RECORDED"` ở đây, vì gõ tay là đẻ
      // bản sao thứ hai của định nghĩa "đã thu".
      payments: {
        where: { deletedAt: null },
        select: { amount: true, accountantStatus: true, saleStatus: true },
      },
    },
  });

  return enrollments.map((e) => {
    const finalPrice = e.finalPrice ?? e.tuition ?? 0;
    // Lọc bằng chính hằng điều kiện của repo để hai đường (query và bộ nhớ) không lệch.
    const daXacNhan = e.payments.filter(
      (p) => p.accountantStatus === KHOAN_DA_XAC_NHAN.accountantStatus,
    );
    // ⚠️ Dùng HÀM, không so với `KHOAN_DA_GHI_NHAN.saleStatus`: từ 14/09 trường đó là
    // `{ in: [...] }`, nên phép so chuỗi-với-đối-tượng luôn false và cột "đã ghi nhận"
    // im lặng về 0 cho mọi dòng công nợ.
    const daGhiNhan = e.payments.filter(laKhoanDaGhiNhan);
    const confirmedPaid = tongDaXacNhan(daXacNhan);
    return {
      enrollmentId: e.id,
      studentId: e.studentId,
      studentName: e.student?.name ?? null,
      courseName: e.course?.name ?? null,
      centerId: e.class?.centerId ?? null,
      finalPrice,
      confirmedPaid,
      debt: finalPrice - confirmedPaid,
      recordedPaid: tongDaXacNhan(daGhiNhan),
      chuaChotGia: e.finalPrice == null,
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

  /**
   * ── BƯỚC A3 [16/09/2026]: KHÔNG NHẮC NỢ TỪ ĐƠN MANG TÊN CON NHÀ KHÁC ─────────
   *
   * Chủ dự án: *"đơn nhiễm: không phát QR, không nhắc nợ ZNS… gửi ra ngoài là lộ thông
   * tin."* Tin nhắc nợ đi THẲNG tới phụ huynh, nên nó cùng loại rủi ro với mã QR.
   *
   * Hỏi MỘT LẦN cho cả lô (`donNhiemTheoDon` nhận cả tập), không hỏi trong vòng lặp.
   *
   * ⚠️ `db` trần là ĐÚNG ở đây: cron chạy không có actor, và một cổng an toàn bị lọc theo
   * tầm nhìn sẽ coi đơn nhiễm ngoài tầm nhìn là SẠCH.
   *
   * ⚠️ CHỈ chặn tiêu chí CON_NHÀ_KHÁC (`chanGuiRaNgoai`). Dữ liệu PROD 16/09: 18 đơn kẹt
   * tiền (178.544.000đ) chỉ dính tiêu chí nhẹ — chặn theo `nhiem` là im lặng thôi nhắc nợ
   * 18 khách vì một lỗi nội bộ, tức hệ thống tự bỏ đòi tiền mà không ai biết.
   */
  const nhiem = await donNhiemTheoDon(db, orders.map((o) => o.id));

  let sent = 0;
  let skipped = 0;
  for (const o of orders) {
    const dn = nhiem.get(o.id);
    if (dn && chanGuiRaNgoai(dn)) { skipped++; continue; }
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

  // Cùng cổng A3 với `remindOverdueSingleOrders` — chặn một cron mà để hở cron kia thì
  // đơn nhiễm vẫn nhắn ra ngoài, chỉ đổi đường. Hỏi MỘT LẦN cho cả lô.
  const nhiem = await donNhiemTheoDon(db, installments.map((i) => i.order.id));

  let found = 0;
  let sent = 0;
  let skipped = 0;
  for (const inst of installments) {
    const dn = nhiem.get(inst.order.id);
    if (dn && chanGuiRaNgoai(dn)) { skipped++; continue; }
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
