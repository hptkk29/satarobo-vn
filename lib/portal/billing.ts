import "server-only";
import { db } from "@/lib/db";

// =============================================================================
// PORTAL BILLING — Phase NHÓM 3
// Đơn hàng/học phí của các con (read-only). Lọc theo Student.parentUserId.
// =============================================================================

export type OrderRow = {
  id: string;
  code: string;
  type: string;
  status: string;
  totalAmount: number;
  paidAt: string | null;
  createdAt: string;
  studentName: string | null;
  items: string[];
};

export async function getParentOrders(parentUserId: string): Promise<OrderRow[]> {
  const children = await db.student.findMany({
    where: { parentUserId, deletedAt: null },
    select: { id: true },
  });
  const childIds = children.map((c) => c.id);
  if (childIds.length === 0) return [];

  const orders = await db.order.findMany({
    where: { studentId: { in: childIds }, deletedAt: null }, // FIX-C3
    select: {
      id: true,
      code: true,
      type: true,
      status: true,
      totalAmount: true,
      paidAt: true,
      createdAt: true,
      student: { select: { name: true } },
      items: { select: { itemName: true }, take: 10 },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return orders.map((o) => ({
    id: o.id,
    code: o.code,
    type: o.type,
    status: o.status,
    totalAmount: o.totalAmount,
    paidAt: o.paidAt?.toISOString() ?? null,
    createdAt: o.createdAt.toISOString(),
    studentName: o.student?.name ?? null,
    items: o.items.map((i) => i.itemName),
  }));
}

// =============================================================================
// R7-04 — PH chỉ thấy khoản đã được KẾ TOÁN XÁC NHẬN (accountantStatus=CONFIRMED).
// Khoản Sale mới ghi nhận (PENDING) KHÔNG hiện cho phụ huynh (AC1).
// =============================================================================

export type ConfirmedPaymentRow = {
  id: string;
  orderId: string;
  orderCode: string | null;
  enrollmentId: string | null;
  studentName: string | null;
  amount: number;
  method: string;
  paidDate: string;
  confirmedAt: string | null;
  receiptCode: string | null;
};

/** Resolve childIds: nhận sẵn mảng studentIds, hoặc tra theo parentUserId. */
async function resolveChildIds(
  client: typeof db,
  parentUserIdOrStudentIds: string | string[],
): Promise<string[]> {
  if (Array.isArray(parentUserIdOrStudentIds)) return parentUserIdOrStudentIds;
  const children = await client.student.findMany({
    where: { parentUserId: parentUserIdOrStudentIds, deletedAt: null },
    select: { id: true },
  });
  return children.map((c) => c.id);
}

/**
 * Khoản thanh toán ĐÃ XÁC NHẬN của các con (read-only, cho portal — AC1: chỉ CONFIRMED).
 * Dùng db trần: ràng buộc theo childIds là cổng sở hữu; PARENT actor không có center-role
 * nên KHÔNG center-scope (scopedDb sẽ lọc rỗng). `client` mặc định db.
 */
export async function getParentConfirmedPayments(
  client: typeof db,
  parentUserIdOrStudentIds: string | string[],
): Promise<ConfirmedPaymentRow[]> {
  const childIds = await resolveChildIds(client, parentUserIdOrStudentIds);
  if (childIds.length === 0) return [];

  const payments = await client.payment.findMany({
    where: {
      accountantStatus: "CONFIRMED",
      deletedAt: null, // FIX-C3
      enrollment: { studentId: { in: childIds }, deletedAt: null },
    },
    select: {
      id: true,
      orderId: true,
      amount: true,
      method: true,
      paidDate: true,
      confirmedAt: true,
      enrollmentId: true,
      order: { select: { code: true } },
      enrollment: { select: { student: { select: { name: true } } } },
      receipts: {
        where: { status: "ACTIVE", deletedAt: null }, // FIX-C3

        select: { code: true },
        orderBy: { issuedAt: "desc" },
        take: 1,
      },
    },
    orderBy: { paidDate: "desc" },
    take: 200,
  });

  return payments.map((p) => ({
    id: p.id,
    orderId: p.orderId,
    orderCode: p.order?.code ?? null,
    enrollmentId: p.enrollmentId,
    studentName: p.enrollment?.student?.name ?? null,
    amount: p.amount,
    method: p.method,
    paidDate: p.paidDate.toISOString(),
    confirmedAt: p.confirmedAt?.toISOString() ?? null,
    receiptCode: p.receipts[0]?.code ?? null,
  }));
}

// =============================================================================
// R7-04 — TRANG HỌC PHÍ PORTAL (P0): nguồn sự thật = Payment 2 tầng, KHÔNG đọc Order cũ.
// Học phí mỗi ghi danh = finalPrice (snapshot tại convert) − Σ Payment(CONFIRMED).
// PARENT không có center-role → cổng sở hữu là studentId thuộc parentUserId (db trần).
// =============================================================================

export type EnrollmentBillingRow = {
  enrollmentId: string;
  status: string;
  studentName: string | null;
  className: string | null;
  finalPrice: number;
  confirmedPaid: number;
  /** finalPrice − confirmedPaid; có thể âm (đóng thừa). */
  outstanding: number;
  /**
   * D5/G.6 — chỉ dấu TRẠNG THÁI (KHÔNG lộ số tiền, giữ AC1): số khoản đang chờ kế
   * toán xác nhận / số khoản bị từ chối, để PH biết có hoạt động đang xử lý.
   */
  pendingCount: number;
  rejectedCount: number;
};

export type ParentBilling = {
  enrollments: EnrollmentBillingRow[];
  /** Lịch sử biên lai đã được kế toán xác nhận. */
  receipts: ConfirmedPaymentRow[];
  totals: { tuition: number; paid: number; outstanding: number };
  /** D5/G.6 — tổng chỉ dấu trạng thái (không kèm số tiền). */
  flags: { pendingCount: number; rejectedCount: number };
};

/**
 * Tổng hợp học phí + công nợ + biên lai cho phụ huynh, từ Payment 2 tầng (R7-04).
 * Chỉ tính ghi danh đã chốt giá (finalPrice != null tại convert R7-05). Chỉ tính
 * Payment accountantStatus=CONFIRMED (AC1: khoản Sale mới ghi nhận chưa hiện).
 */
export async function getParentBilling(parentUserId: string): Promise<ParentBilling> {
  const empty: ParentBilling = {
    enrollments: [],
    receipts: [],
    totals: { tuition: 0, paid: 0, outstanding: 0 },
    flags: { pendingCount: 0, rejectedCount: 0 },
  };
  const childIds = await resolveChildIds(db, parentUserId);
  if (childIds.length === 0) return empty;

  const enrollments = await db.enrollment.findMany({
    where: { studentId: { in: childIds }, finalPrice: { not: null } },
    select: {
      id: true,
      status: true,
      finalPrice: true,
      tuition: true,
      student: { select: { name: true } },
      class: { select: { name: true } },
      // CHỈ lấy số tiền của khoản CONFIRMED; PENDING/REJECTED chỉ lấy trạng thái để
      // ĐẾM (không kèm amount) — giữ AC1: không lộ số tiền khoản chưa xác nhận cho PH.
      payments: { select: { accountantStatus: true, amount: true } },
    },
    orderBy: { enrolledAt: "desc" },
    take: 100,
  });

  const rows: EnrollmentBillingRow[] = enrollments.map((e) => {
    const finalPrice = e.finalPrice ?? e.tuition ?? 0;
    const confirmedPaid = e.payments
      .filter((p) => p.accountantStatus === "CONFIRMED")
      .reduce((s, p) => s + p.amount, 0);
    const pendingCount = e.payments.filter((p) => p.accountantStatus === "PENDING").length;
    const rejectedCount = e.payments.filter((p) => p.accountantStatus === "REJECTED").length;
    return {
      enrollmentId: e.id,
      status: e.status,
      studentName: e.student?.name ?? null,
      className: e.class?.name ?? null,
      finalPrice,
      confirmedPaid,
      outstanding: finalPrice - confirmedPaid,
      pendingCount,
      rejectedCount,
    };
  });

  const receipts = await getParentConfirmedPayments(db, childIds);

  const totals = rows.reduce(
    (acc, r) => {
      acc.tuition += r.finalPrice;
      acc.paid += r.confirmedPaid;
      acc.outstanding += Math.max(0, r.outstanding);
      return acc;
    },
    { tuition: 0, paid: 0, outstanding: 0 },
  );

  const flags = rows.reduce(
    (acc, r) => {
      acc.pendingCount += r.pendingCount;
      acc.rejectedCount += r.rejectedCount;
      return acc;
    },
    { pendingCount: 0, rejectedCount: 0 },
  );

  return { enrollments: rows, receipts, totals, flags };
}
