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
