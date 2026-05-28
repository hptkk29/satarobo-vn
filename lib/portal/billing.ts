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
    where: { studentId: { in: childIds } },
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
