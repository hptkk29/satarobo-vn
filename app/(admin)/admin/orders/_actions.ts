"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { Prisma, type OrderStatus, type OrderType } from "@prisma/client";
import { auth } from "@/lib/auth";
import { can } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import {
  orderCreateManualSchema,
  orderStatusChangeSchema,
} from "@/lib/validators/order";
import { generateOrderCode } from "@/lib/orders/code";
import { canTransition } from "@/lib/orders/status";
import { getRequestMetadata } from "@/lib/audit/headers";
import { getAuditActor } from "@/lib/audit/log";

const PAGE_SIZE = 20;

async function requireOrdersView() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!can(session.user, "orders:view")) {
    redirect("/dashboard?error=unauthorized");
  }
  return session;
}

async function requireOrdersManage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!can(session.user, "orders:manage")) {
    redirect("/dashboard?error=unauthorized");
  }
  return session;
}

function encodeCursor(createdAt: Date, id: string): string {
  return Buffer.from(
    JSON.stringify({ c: createdAt.toISOString(), i: id }),
  ).toString("base64");
}
function decodeCursor(cursor: string): { createdAt: Date; id: string } | null {
  try {
    const decoded = JSON.parse(Buffer.from(cursor, "base64").toString()) as {
      c: string;
      i: string;
    };
    return { createdAt: new Date(decoded.c), id: decoded.i };
  } catch {
    return null;
  }
}

export type OrderFilters = {
  dateFrom?: string;
  dateTo?: string;
  status?: OrderStatus;
  type?: OrderType;
  search?: string;
};

// ─── QUERY ORDERS LIST ──────────────────────────────────────────────
export async function queryOrders(
  filters: OrderFilters,
  cursor: string | null,
) {
  await requireOrdersView();

  const AND: Array<Record<string, unknown>> = [];
  if (filters.dateFrom)
    AND.push({ createdAt: { gte: new Date(filters.dateFrom) } });
  if (filters.dateTo) {
    const to = new Date(filters.dateTo);
    to.setHours(23, 59, 59, 999);
    AND.push({ createdAt: { lte: to } });
  }
  if (filters.status) AND.push({ status: filters.status });
  if (filters.type) AND.push({ type: filters.type });
  if (filters.search) {
    const s = filters.search.trim();
    AND.push({
      OR: [
        { code: { contains: s, mode: "insensitive" } },
        { customerName: { contains: s, mode: "insensitive" } },
        { customerPhone: { contains: s } },
      ],
    });
  }

  if (cursor) {
    const decoded = decodeCursor(cursor);
    if (decoded) {
      AND.push({
        OR: [
          { createdAt: { lt: decoded.createdAt } },
          {
            AND: [{ createdAt: decoded.createdAt }, { id: { lt: decoded.id } }],
          },
        ],
      });
    }
  }

  const rows = await db.order.findMany({
    where: AND.length ? { AND } : undefined,
    include: {
      paymentMethod: { select: { code: true, name: true } },
      _count: { select: { items: true } },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: PAGE_SIZE + 1,
  });

  const hasMore = rows.length > PAGE_SIZE;
  const items = hasMore ? rows.slice(0, PAGE_SIZE) : rows;
  const last = items[items.length - 1];
  const nextCursor =
    hasMore && last ? encodeCursor(last.createdAt, last.id) : null;

  return { items, nextCursor };
}

// ─── CREATE MANUAL ORDER ────────────────────────────────────────────
export async function createOrderManualAction(input: unknown) {
  const session = await requireOrdersManage();
  const parsed = orderCreateManualSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false as const,
      error: "Dữ liệu không hợp lệ",
      issues: parsed.error.flatten(),
    };
  }

  const data = parsed.data;

  const subtotal = data.items.reduce(
    (s, it) => s + it.unitPrice * it.quantity,
    0,
  );
  const totalAmount = subtotal - data.discountAmount + data.shippingFee;
  if (totalAmount < 0) {
    return { ok: false as const, error: "Tổng tiền không thể âm" };
  }

  const pm = await db.paymentMethod.findUnique({
    where: { id: data.paymentMethodId },
    select: {
      id: true,
      isActive: true,
      canBuyCourse: true,
      canBuyPackage: true,
      canBuyExam: true,
      canBuyProduct: true,
    },
  });
  if (!pm)
    return {
      ok: false as const,
      error: "Phương thức thanh toán không tồn tại",
    };
  if (!pm.isActive)
    return {
      ok: false as const,
      error: "Phương thức thanh toán đã bị vô hiệu hoá",
    };

  const allowedMap: Record<OrderType, boolean> = {
    COURSE: pm.canBuyCourse,
    PACKAGE: pm.canBuyPackage,
    EXAM: pm.canBuyExam,
    PRODUCT: pm.canBuyProduct,
    COMBO: false,
  };
  if (!allowedMap[data.type]) {
    return {
      ok: false as const,
      error: `Phương thức này không hỗ trợ loại đơn "${data.type}"`,
    };
  }

  const code = await generateOrderCode();
  // Actor info not yet used (no OrderAuditLog model — OrderStatusHistory only).
  // Keep `session` lookup to preserve auth check ordering.
  void session;

  const created = await db.$transaction(async (tx) => {
    const order = await tx.order.create({
      data: {
        code,
        type: data.type,
        status: data.status,
        customerName: data.customerName.trim(),
        customerPhone: data.customerPhone.trim(),
        customerEmail: data.customerEmail?.trim() || null,
        customerAddress: data.customerAddress?.trim() || null,
        customerWard: data.customerWard?.trim() || null,
        customerCity: data.customerCity?.trim() || null,
        studentId: data.studentId || null,
        leadId: data.leadId || null,
        centerId: data.centerId || null,
        paymentMethodId: data.paymentMethodId,
        subtotal,
        discountAmount: data.discountAmount,
        shippingFee: data.shippingFee,
        totalAmount,
        voucherCode: data.voucherCode?.trim() || null,
        customerNote: data.customerNote?.trim() || null,
        internalNote: data.internalNote?.trim() || null,
        items: {
          create: data.items.map((it) => ({
            type: it.type,
            itemName: it.itemName,
            itemDescription: it.itemDescription || null,
            quantity: it.quantity,
            unitPrice: it.unitPrice,
            totalPrice: it.unitPrice * it.quantity,
            packageId: it.packageId || null,
            examAttemptId: it.examAttemptId || null,
            metadata: (it.metadata as Prisma.InputJsonValue) ?? Prisma.JsonNull,
          })),
        },
      },
      select: { id: true, code: true },
    });

    return order;
  });

  revalidatePath("/orders");
  return { ok: true as const, id: created.id, code: created.code };
}

// ─── CHANGE STATUS ──────────────────────────────────────────────────
export async function changeOrderStatusAction(
  orderId: string,
  input: unknown,
) {
  const session = await requireOrdersManage();
  const parsed = orderStatusChangeSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: "Dữ liệu không hợp lệ" };
  }

  const order = await db.order.findUnique({
    where: { id: orderId },
    select: { id: true, status: true },
  });
  if (!order) return { ok: false as const, error: "Không tìm thấy đơn hàng" };

  if (order.status === parsed.data.toStatus) {
    return {
      ok: false as const,
      error: "Trạng thái mới giống trạng thái hiện tại",
    };
  }

  if (!canTransition(order.status, parsed.data.toStatus)) {
    return {
      ok: false as const,
      error: `Không thể chuyển từ "${order.status}" sang "${parsed.data.toStatus}"`,
    };
  }

  const { actorId, actorName } = getAuditActor(session);
  const metadata = await getRequestMetadata();

  await db.$transaction(async (tx) => {
    const updateData: Prisma.OrderUpdateInput = {
      status: parsed.data.toStatus,
    };

    if (
      parsed.data.toStatus === "CONFIRMED" &&
      order.status === "PENDING_PAYMENT"
    ) {
      updateData.confirmedByUserId = actorId;
      updateData.confirmedAt = new Date();
      updateData.paidAt = new Date();
    }

    await tx.order.update({ where: { id: orderId }, data: updateData });

    await tx.orderStatusHistory.create({
      data: {
        orderId,
        fromStatus: order.status,
        toStatus: parsed.data.toStatus,
        changedByUserId: actorId,
        changedByName: actorName,
        reason: parsed.data.reason?.trim() || null,
        metadata: metadata as unknown as Prisma.InputJsonValue,
      },
    });
  });

  revalidatePath("/orders");
  revalidatePath(`/orders/${orderId}`);
  return { ok: true as const };
}

// ─── UPDATE NOTES (admin internal note) ─────────────────────────────
export async function updateOrderNoteAction(
  orderId: string,
  internalNote: string,
) {
  await requireOrdersManage();

  if (internalNote.length > 2000) {
    return { ok: false as const, error: "Ghi chú quá dài (max 2000 ký tự)" };
  }

  const order = await db.order.findUnique({
    where: { id: orderId },
    select: { id: true },
  });
  if (!order) return { ok: false as const, error: "Không tìm thấy đơn hàng" };

  await db.order.update({
    where: { id: orderId },
    data: { internalNote: internalNote.trim() || null },
  });

  revalidatePath(`/orders/${orderId}`);
  return { ok: true as const };
}

// ─── HELPER: load form data cho create page ─────────────────────────
export async function loadCreateOrderFormData() {
  await requireOrdersManage();

  const [paymentMethods, courses, packages, centers] = await Promise.all([
    db.paymentMethod.findMany({
      where: { isActive: true },
      orderBy: { displayOrder: "asc" },
      select: {
        id: true,
        code: true,
        name: true,
        type: true,
        canBuyCourse: true,
        canBuyPackage: true,
        canBuyExam: true,
        canBuyProduct: true,
      },
    }),
    db.course.findMany({
      where: { isActive: true, isPublished: true },
      orderBy: { displayOrder: "asc" },
      select: { id: true, code: true, name: true, price: true, type: true },
    }),
    db.coursePackage.findMany({
      where: { isPublished: true },
      orderBy: { displayOrder: "asc" },
      select: {
        id: true,
        code: true,
        name: true,
        priceMember: true,
        priceEarlyBird: true,
      },
    }),
    db.center.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  return { paymentMethods, courses, packages, centers };
}

// ─── Row type for client ─────────────────────────────────────────────
export type OrderRow = Awaited<ReturnType<typeof queryOrders>>["items"][number];
