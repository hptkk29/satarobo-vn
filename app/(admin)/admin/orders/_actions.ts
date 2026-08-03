"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { Prisma, type OrderStatus, type OrderType } from "@prisma/client";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/auth/check-permission";
import { resolveActor } from "@/lib/auth/actor";
import { scopedDb, passesScope } from "@/lib/db-scope";
import {
  orderCreateManualSchema,
  orderStatusChangeSchema,
} from "@/lib/validators/order";
import { generateOrderCode, withUniqueRetry } from "@/lib/orders/code";
import { canTransition } from "@/lib/orders/status";
import { recordInstallmentPlan, markInstallmentPaid } from "@/lib/orders/installments";
import { discountFromPercent, needsDiscountApproval } from "@/lib/orders/discount";
import { ensureParentAccountForOrder } from "@/lib/parents/provision";
import { ensureOrderPaymentRecorded } from "@/lib/finance/payment";
import { getRequestMetadata } from "@/lib/audit/headers";
import { getAuditActor } from "@/lib/audit/log";
import { sendEmailForTrigger } from "@/lib/email/trigger";
import { notifyOrderByZnsIfNoEmail } from "@/lib/notify/order";
import { renderTemplate } from "@/lib/email/render";
import { sendEmail } from "@/lib/email/send";

const PAGE_SIZE = 20;

async function requireOrdersView() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  // Gate list-level (nhiều đơn, không có 1 centerId cụ thể) — không truyền target.
  if (!(await checkPermission("orders:view"))) {
    redirect("/dashboard?error=unauthorized");
  }
  return session;
}

async function requireOrdersManage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  // orders:manage chỉ HO_ACCOUNTANT (GLOBAL) — không cần target.
  if (!(await checkPermission("orders:manage"))) {
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
  const session = await requireOrdersView();
  // Cách ly cơ sở: Order ∈ SCOPED_MODELS → findMany tự inject `centerId IN visibleCenterIds`.
  const sdb = scopedDb(await resolveActor(session.user.id));

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

  const rows = await sdb.order.findMany({
    where: AND.length ? { AND } : undefined,
    include: {
      paymentMethod: { select: { code: true, name: true } },
      _count: { select: { items: true } },
      // G5 — badge suy diễn "Đã đóng đợt 1" cho danh sách (chỉ cần soDot + status).
      installments: { select: { soDot: true, status: true } },
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
  const actor = await resolveActor(session.user.id);
  const sdb = scopedDb(actor);
  const parsed = orderCreateManualSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false as const,
      error: "Dữ liệu không hợp lệ",
      issues: parsed.error.flatten(),
    };
  }

  const data = parsed.data;

  // Cách ly cơ sở (ghi): nếu form chọn cơ sở, cơ sở đó phải thuộc tầm nhìn actor
  // (orders:manage hiện là GLOBAL — guard này chỉ chặn khi role bị thu hẹp sau này).
  if (data.centerId && !passesScope("Order", { centerId: data.centerId }, actor)) {
    return { ok: false as const, error: "Không có quyền tạo đơn cho cơ sở này" };
  }

  const subtotal = data.items.reduce(
    (s, it) => s + it.unitPrice * it.quantity,
    0,
  );

  // BGĐ 31/07 — giảm giá theo %: server tự quy ra số tiền (nguồn sự thật).
  if (data.discountPercent && data.discountPercent > 0) {
    data.discountAmount = discountFromPercent(subtotal, data.discountPercent);
  }

  const totalAmount = subtotal - data.discountAmount + data.shippingFee;
  if (totalAmount < 0) {
    return { ok: false as const, error: "Tổng tiền không thể âm" };
  }

  // BGĐ 31/07 — giảm giá nhập tay phải qua duyệt của Quản lý cơ sở trước khi đơn
  // được xác nhận (đơn tạo ra ở trạng thái chờ duyệt giảm giá).
  const discountNeedsApproval = needsDiscountApproval({
    discountAmount: data.discountAmount,
  });
  if (discountNeedsApproval && !data.discountReason?.trim()) {
    return { ok: false as const, error: "Nhập giải trình giảm giá" };
  }

  // PaymentMethod/Product là catalog toàn cục (không scoped) — scopedDb pass-through.
  const pm = await sdb.paymentMethod.findUnique({
    where: { id: data.paymentMethodId },
    select: {
      id: true,
      name: true,
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

  // Phase 5.10.1 — PRODUCT order validation (single-item v1).
  // Verify product exists, is ACTIVE, has enough stock. The actual stock
  // decrement happens inside the tx below to keep create + decrement atomic.
  let productSnapshot: {
    productId: string;
    name: string;
    salePrice: number;
    currentStock: number;
    quantityRequested: number;
  } | null = null;

  if (data.type === "PRODUCT") {
    const item = data.items[0];
    if (!item || !item.productId) {
      return {
        ok: false as const,
        error: "Đơn PRODUCT phải chọn sản phẩm",
      };
    }
    const product = await sdb.product.findUnique({
      where: { id: item.productId },
      select: {
        id: true,
        name: true,
        salePrice: true,
        stockOnHand: true,
        status: true,
      },
    });
    if (!product) {
      return { ok: false as const, error: "Sản phẩm không tồn tại" };
    }
    if (product.status !== "ACTIVE") {
      return {
        ok: false as const,
        error: `Sản phẩm "${product.name}" không đang bán (status=${product.status})`,
      };
    }
    if (product.stockOnHand < item.quantity) {
      return {
        ok: false as const,
        error: `Tồn kho không đủ. Hiện có ${product.stockOnHand}, yêu cầu ${item.quantity}`,
      };
    }
    productSnapshot = {
      productId: product.id,
      name: product.name,
      salePrice: product.salePrice,
      currentStock: product.stockOnHand,
      quantityRequested: item.quantity,
    };
  }

  const { actorId, actorName } = getAuditActor(session);

  // FIX-C5 — codegen atomic BÊN TRONG tx (`generateOrderCode(tx)`) + retry khi
  // đụng unique-violation (P2002) như backstop. Cả tx re-run khi retry.
  // A0-04: tx từ scopedDb — cast vì extended client không structurally-assignable
  // vào Prisma.TransactionClient (tiền lệ students/classes). Cấu trúc tx GIỮ NGUYÊN.
  const created = await withUniqueRetry(() =>
    sdb.$transaction(async (txRaw) => {
      const tx = txRaw as unknown as Prisma.TransactionClient;
      const code = await generateOrderCode(tx);
      const order = await tx.order.create({
      data: {
        code,
        type: data.type,
        status: data.status,
        customerName: data.customerName.trim(),
        customerPhone: data.customerPhone.trim(),
        // P5 — validator đã trim + lowercase + đưa ô trống về null.
        customerEmail: data.customerEmail,
        customerCccd: data.customerCccd?.trim() || null,
        customerAddress: data.customerAddress?.trim() || null,
        customerWard: data.customerWard?.trim() || null,
        customerCity: data.customerCity?.trim() || null,
        studentId: data.studentId || null,
        leadId: data.leadId || null,
        centerId: data.centerId || null,
        paymentMethodId: data.paymentMethodId,
        subtotal,
        discountAmount: data.discountAmount,
        // BGĐ 31/07 — snapshot cách nhập giảm giá + giải trình + cờ chờ duyệt.
        discountPercent: data.discountPercent ?? null,
        discountReason: discountNeedsApproval ? (data.discountReason?.trim() ?? null) : null,
        discountApprovalStatus: discountNeedsApproval ? "PENDING_APPROVAL" : null,
        discountRequestedById: discountNeedsApproval ? actorId : null,
        shippingFee: data.shippingFee,
        totalAmount,
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
            productId: it.productId || null,
            metadata: (it.metadata as Prisma.InputJsonValue) ?? Prisma.JsonNull,
          })),
        },
      },
      select: { id: true, code: true },
    });

    // Phase 5.10.1 — Stock decrement + SALE movement for PRODUCT orders.
    // Inside same tx so order + stock move atomically. Defensive guard:
    // if a concurrent order race makes stock < 0, throw to rollback.
    if (productSnapshot) {
      const updated = await tx.product.update({
        where: { id: productSnapshot.productId },
        data: {
          stockOnHand: { decrement: productSnapshot.quantityRequested },
        },
        select: { stockOnHand: true },
      });

      if (updated.stockOnHand < 0) {
        throw new Error("PRODUCT_STOCK_INSUFFICIENT_RACE");
      }

      await tx.productMovement.create({
        data: {
          productId: productSnapshot.productId,
          type: "SALE",
          quantity: -productSnapshot.quantityRequested,
          reason: `Bán theo đơn ${order.code}`,
          orderId: order.id,
          stockBeforeMovement: productSnapshot.currentStock,
          stockAfterMovement: updated.stockOnHand,
          createdByUserId: actorId,
          createdByName: actorName,
        },
      });
    }

      return order;
    }),
  );

  revalidatePath("/orders");
  if (productSnapshot) {
    revalidatePath("/products");
    revalidatePath(`/products/${productSnapshot.productId}`);
  }

  sendEmailForTrigger({
    trigger: "ORDER_CONFIRMATION",
    recipient: {
      email: data.customerEmail,
      name: data.customerName,
    },
    vars: {
      customer_name: data.customerName,
      order_code: created.code,
      total_amount: totalAmount,
      payment_method: pm.name ?? "—",
      order_date: new Date(),
      items_list: renderItemsListHtml(data.items),
    },
    context: { type: "Order", id: created.id },
    triggerType: "SYSTEM",
    actor: { userId: actorId, name: actorName },
  }).catch((err) => {
    console.error("[email] ORDER_CONFIRMATION trigger error:", err);
  });

  // P5 — khách không có email thì email trigger ở trên tự bỏ qua; ZNS lo phần đó.
  void notifyOrderByZnsIfNoEmail(created.id);

  return { ok: true as const, id: created.id, code: created.code };
}

function renderItemsListHtml(
  items: Array<{ itemName: string; quantity: number; unitPrice: number }>,
): string {
  const rows = items
    .map((it) => {
      const lineTotal = it.unitPrice * it.quantity;
      return `<li>${escapeHtml(it.itemName)} × ${it.quantity} = ${lineTotal.toLocaleString("vi-VN")} đ</li>`;
    })
    .join("");
  return `<ul>${rows}</ul>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// ─── CHANGE STATUS ──────────────────────────────────────────────────
export async function changeOrderStatusAction(
  orderId: string,
  input: unknown,
  // FIX-H9 — optimistic lock: Order.updatedAt (ISO) client đã thấy. Lệch → STALE_WRITE.
  expectedUpdatedAt?: string,
) {
  const session = await requireOrdersManage();
  const parsed = orderStatusChangeSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: "Dữ liệu không hợp lệ" };
  }

  const actor = await resolveActor(session.user.id);
  const sdb = scopedDb(actor);
  // findUnique qua scopedDb đã chống IDOR (ngoài scope → null); giữ passesScope làm belt-and-suspenders.
  const order = await sdb.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      status: true,
      centerId: true,
      leadId: true,
      totalAmount: true,
      discountApprovalStatus: true,
    },
  });
  if (!order || !passesScope("Order", order, actor)) {
    return { ok: false as const, error: "Không tìm thấy đơn hàng" };
  }

  // BGĐ 31/07 — đơn có giảm giá nhập tay chỉ được xác nhận sau khi QL cơ sở duyệt.
  if (parsed.data.toStatus === "CONFIRMED" && order.discountApprovalStatus != null) {
    if (order.discountApprovalStatus === "PENDING_APPROVAL") {
      return {
        ok: false as const,
        error: "Giảm giá đang chờ Quản lý cơ sở duyệt — chưa thể xác nhận đơn",
      };
    }
    if (order.discountApprovalStatus === "REJECTED") {
      return {
        ok: false as const,
        error: "Giảm giá đã bị từ chối — sửa lại đơn trước khi xác nhận",
      };
    }
  }

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
  const expectedAt = expectedUpdatedAt ? new Date(expectedUpdatedAt) : null;

  // A0-04: tx từ scopedDb — cast (tiền lệ). Cấu trúc transaction tiền GIỮ NGUYÊN
  // (updateMany optimistic-lock + history + ensureOrderPaymentRecorded atomic).
  const txResult = await sdb.$transaction(async (txRaw) => {
    const tx = txRaw as unknown as Prisma.TransactionClient;
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

    // FIX-H9 — ghi có điều kiện updatedAt; 0 row ⇒ người khác vừa sửa → STALE_WRITE.
    const upd = await tx.order.updateMany({
      where: { id: orderId, ...(expectedAt ? { updatedAt: expectedAt } : {}) },
      data: updateData as Prisma.OrderUpdateManyMutationInput,
    });
    if (upd.count === 0) return { stale: true as const };

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

    // S1 — xác nhận đơn (thu offline): nếu CHƯA có khoản RECORDED nào (đơn không đi qua
    // installments) → ghi 1 Payment(RECORDED) cho phần đã thu (idempotent theo marker
    // [auto:order-confirm]). Tránh double-count khi installments đã ghi sổ.
    if (parsed.data.toStatus === "CONFIRMED" && order.status === "PENDING_PAYMENT") {
      const recorded = await tx.payment.aggregate({
        where: { orderId, saleStatus: "RECORDED", deletedAt: null },
        _count: { _all: true },
      });
      if (recorded._count._all === 0) {
        await ensureOrderPaymentRecorded(tx, {
          orderId,
          amount: order.totalAmount,
          leadId: order.leadId,
          centerId: order.centerId,
          actor: { id: actorId, name: actorName },
        });
      }
    }
    return { stale: false as const };
  });

  if (txResult.stale) return { ok: false as const, error: "STALE_WRITE" };

  revalidatePath("/orders");
  revalidatePath(`/orders/${orderId}`);
  // S6 — đồng bộ trang lead/convert (đổi trạng thái đơn ảnh hưởng "đủ điều kiện chốt").
  if (order.leadId) {
    revalidatePath(`/leads/${order.leadId}`);
    revalidatePath(`/leads/${order.leadId}/convert`);
  }

  // BGĐ 31/07 — xác nhận thanh toán → tự cấp tài khoản phụ huynh theo SĐT + báo ZNS.
  // Fire-and-forget, idempotent (đã có tài khoản → không tạo/gửi lại).
  if (parsed.data.toStatus === "CONFIRMED") {
    ensureParentAccountForOrder(orderId).catch((err) =>
      console.error("[order-confirm] provision parent:", err),
    );
  }

  // Fire PAYMENT_RECEIPT when order transitions to CONFIRMED (paidAt set).
  if (parsed.data.toStatus === "CONFIRMED") {
    const orderForEmail = await sdb.order.findUnique({
      where: { id: orderId },
      include: { paymentMethod: { select: { name: true } } },
    });
    if (orderForEmail) {
      sendEmailForTrigger({
        trigger: "PAYMENT_RECEIPT",
        recipient: {
          email: orderForEmail.customerEmail,
          name: orderForEmail.customerName,
        },
        vars: {
          customer_name: orderForEmail.customerName,
          order_code: orderForEmail.code,
          total_amount: orderForEmail.totalAmount,
          payment_method: orderForEmail.paymentMethod?.name ?? "—",
          paid_at: orderForEmail.paidAt ?? new Date(),
        },
        context: { type: "Order", id: orderForEmail.id },
        triggerType: "SYSTEM",
        actor: { userId: actorId, name: actorName },
      }).catch((err) => {
        console.error("[email] PAYMENT_RECEIPT trigger error:", err);
      });

      // P5 — biên nhận qua ZNS cho khách không có email (xem lib/notify/order.ts).
      void notifyOrderByZnsIfNoEmail(orderForEmail.id);
    }
  }

  return { ok: true as const };
}

// ─── UPDATE NOTES (admin internal note) ─────────────────────────────
export async function updateOrderNoteAction(
  orderId: string,
  internalNote: string,
  // FIX-H9 — optimistic lock: Order.updatedAt (ISO) client đã thấy. Lệch → STALE_WRITE.
  expectedUpdatedAt?: string,
) {
  const session = await requireOrdersManage();

  if (internalNote.length > 2000) {
    return { ok: false as const, error: "Ghi chú quá dài (max 2000 ký tự)" };
  }

  const actor = await resolveActor(session.user.id);
  const sdb = scopedDb(actor);
  const order = await sdb.order.findUnique({
    where: { id: orderId },
    select: { id: true, centerId: true },
  });
  if (!order || !passesScope("Order", order, actor)) {
    return { ok: false as const, error: "Không tìm thấy đơn hàng" };
  }

  const expectedAt = expectedUpdatedAt ? new Date(expectedUpdatedAt) : null;
  // FIX-H9 — ghi có điều kiện updatedAt; 0 row ⇒ người khác vừa sửa → STALE_WRITE.
  const upd = await sdb.order.updateMany({
    where: { id: orderId, ...(expectedAt ? { updatedAt: expectedAt } : {}) },
    data: { internalNote: internalNote.trim() || null },
  });
  if (upd.count === 0) return { ok: false as const, error: "STALE_WRITE" };

  revalidatePath(`/orders/${orderId}`);
  return { ok: true as const };
}

// ─── UPDATE PAYMENT METHOD (G4 — chỉ khi đơn CHƯA xác nhận thanh toán) ─
export async function updateOrderPaymentMethodAction(
  orderId: string,
  paymentMethodId: string,
  // FIX-H9 — optimistic lock: Order.updatedAt (ISO) client đã thấy. Lệch → STALE_WRITE.
  expectedUpdatedAt?: string,
) {
  const session = await requireOrdersManage();

  const actor = await resolveActor(session.user.id);
  const sdb = scopedDb(actor);
  const order = await sdb.order.findUnique({
    where: { id: orderId },
    select: { id: true, centerId: true, status: true, type: true },
  });
  if (!order || !passesScope("Order", order, actor)) {
    return { ok: false as const, error: "Không tìm thấy đơn hàng" };
  }
  // G4 (chốt): chỉ cho sửa phương thức khi đơn còn DRAFT/PENDING_PAYMENT (chưa chốt tiền).
  if (order.status !== "DRAFT" && order.status !== "PENDING_PAYMENT") {
    return {
      ok: false as const,
      error: "Chỉ sửa phương thức khi đơn chưa xác nhận thanh toán",
    };
  }

  const pm = await sdb.paymentMethod.findUnique({
    where: { id: paymentMethodId },
    select: {
      id: true,
      isActive: true,
      canBuyCourse: true,
      canBuyPackage: true,
      canBuyExam: true,
      canBuyProduct: true,
    },
  });
  if (!pm) {
    return { ok: false as const, error: "Phương thức thanh toán không tồn tại" };
  }
  if (!pm.isActive) {
    return { ok: false as const, error: "Phương thức thanh toán đã bị vô hiệu hoá" };
  }
  const allowedMap: Record<OrderType, boolean> = {
    COURSE: pm.canBuyCourse,
    PACKAGE: pm.canBuyPackage,
    EXAM: pm.canBuyExam,
    PRODUCT: pm.canBuyProduct,
    COMBO: false,
  };
  if (!allowedMap[order.type]) {
    return {
      ok: false as const,
      error: `Phương thức này không hỗ trợ loại đơn "${order.type}"`,
    };
  }

  const expectedAt = expectedUpdatedAt ? new Date(expectedUpdatedAt) : null;
  const upd = await sdb.order.updateMany({
    where: { id: orderId, ...(expectedAt ? { updatedAt: expectedAt } : {}) },
    data: { paymentMethodId },
  });
  if (upd.count === 0) return { ok: false as const, error: "STALE_WRITE" };

  revalidatePath(`/orders/${orderId}`);
  return { ok: true as const };
}

// ─── HELPER: load form data cho create page ─────────────────────────
export async function loadCreateOrderFormData() {
  const session = await requireOrdersManage();
  // PaymentMethod/Course/Product là catalog, Center exempt — scopedDb pass-through.
  const sdb = scopedDb(await resolveActor(session.user.id));

  const [paymentMethods, courses, products, centers] = await Promise.all([
    sdb.paymentMethod.findMany({
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
    sdb.course.findMany({
      // O1/O3: chỉ khoá DẠY thật (Sata 1–8 + combo teachable), loại 2 "danh mục"
      // Lập trình Robot / Luyện thi RoboSim (isTeachable=false). Combo 1&2 là course
      // teachable nên tự nằm trong danh sách "Khoá học".
      // O4: KHÔNG lọc isPublished — khoá Sata teachable bị seed để isPublished=false
      // (publish chỉ dùng cho trang marketing công khai). Đơn hàng gate theo isTeachable.
      where: { isActive: true, isTeachable: true },
      orderBy: { displayOrder: "asc" },
      select: { id: true, code: true, name: true, price: true, type: true },
    }),
    sdb.product.findMany({
      // O3: đơn "Sản phẩm" chỉ gồm KIT_ROBOT + SENSOR.
      where: { status: "ACTIVE", category: { in: ["KIT_ROBOT", "SENSOR"] } },
      orderBy: { name: "asc" },
      take: 200,
      select: {
        id: true,
        sku: true,
        name: true,
        salePrice: true,
        stockOnHand: true,
        category: true,
      },
    }),
    sdb.center.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  return { paymentMethods, courses, products, centers };
}

// ─── MANUAL SEND EMAIL từ template (Phase 5.13.1) ───────────────────
export async function sendManualOrderEmailAction(input: {
  orderId: string;
  templateId: string;
  toEmail: string;
  toName?: string | null;
}) {
  const session = await requireOrdersManage();

  if (!input.toEmail?.trim()) {
    return { ok: false as const, error: "Vui lòng nhập email người nhận" };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.toEmail)) {
    return { ok: false as const, error: "Email không hợp lệ" };
  }

  const actor = await resolveActor(session.user.id);
  const sdb = scopedDb(actor);
  const [template, order] = await Promise.all([
    sdb.emailTemplate.findUnique({ where: { id: input.templateId } }),
    sdb.order.findUnique({
      where: { id: input.orderId },
      include: {
        items: true,
        paymentMethod: { select: { name: true } },
      },
    }),
  ]);
  if (!template)
    return { ok: false as const, error: "Template không tồn tại" };
  if (!template.isActive)
    return { ok: false as const, error: "Template đã bị tắt" };
  if (!order || !passesScope("Order", order, actor)) {
    return { ok: false as const, error: "Đơn hàng không tồn tại" };
  }

  const itemsListInner = order.items
    .map(
      (it) =>
        `<li>${it.itemName} × ${it.quantity} = ${(it.unitPrice * it.quantity).toLocaleString("vi-VN")} đ</li>`,
    )
    .join("");

  const vars = {
    customer_name: order.customerName,
    order_code: order.code,
    total_amount: order.totalAmount,
    payment_method: order.paymentMethod?.name ?? "—",
    order_date: order.createdAt,
    paid_at: order.paidAt ?? "",
    items_list: itemsListInner ? `<ul>${itemsListInner}</ul>` : "",
  };

  const subject = renderTemplate(template.subject, vars);
  const bodyText = renderTemplate(template.bodyText, vars);
  const bodyHtml = renderTemplate(template.bodyHtml, vars);

  const { actorId, actorName } = getAuditActor(session);

  const result = await sendEmail({
    to: input.toEmail.trim(),
    toName: input.toName ?? undefined,
    subject,
    bodyText,
    bodyHtml,
    fromName: template.fromName ?? undefined,
    replyTo: template.replyTo ?? undefined,
    templateId: template.id,
    contextType: "Order",
    contextId: order.id,
    triggeredByUserId: actorId,
    triggeredByName: actorName,
    triggerType: "MANUAL",
  });

  if (!result.ok) {
    return { ok: false as const, error: result.error };
  }

  revalidatePath(`/orders/${input.orderId}`);
  return { ok: true as const, logId: result.logId };
}

// ─── Commit 4 — thanh toán 2 đợt ─────────────────────────────────────
export async function recordOrderInstallmentsAction(input: {
  orderId: string;
  dot1Amount: number;
  dot2Amount: number;
  dot2DueDate: string | null;
  // OD1 — số ngày nhắc trước hạn đợt 2; null → cron dùng SystemSetting default 14.
  reminderDays?: number | null;
}): Promise<{ ok: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Chưa đăng nhập" };
  // orders:manage chỉ HO_ACCOUNTANT (GLOBAL) — không cần target.
  if (!(await checkPermission("orders:manage"))) return { ok: false, error: "Không có quyền" };

  const actor = await resolveActor(session.user.id);
  const order = await scopedDb(actor).order.findUnique({
    where: { id: input.orderId },
    select: { id: true, centerId: true, leadId: true },
  });
  if (!order || !passesScope("Order", order, actor)) {
    return { ok: false, error: "Không tìm thấy đơn hàng" };
  }

  const res = await recordInstallmentPlan({
    orderId: input.orderId,
    dot1Amount: Math.round(input.dot1Amount),
    dot2Amount: Math.round(input.dot2Amount),
    dot2DueDate: input.dot2DueDate ? new Date(input.dot2DueDate) : null,
    actorId: session.user.id ?? null,
    reminderDays:
      input.reminderDays == null ? null : Math.max(0, Math.round(input.reminderDays)),
  });
  if (res.ok) {
    revalidatePath(`/orders/${input.orderId}`);
    // S6 — ghi sổ đợt 1 sinh Payment(RECORDED) → đồng bộ trang lead/convert.
    if (order.leadId) {
      revalidatePath(`/leads/${order.leadId}`);
      revalidatePath(`/leads/${order.leadId}/convert`);
    }
  }
  return res;
}

export async function markOrderInstallmentPaidAction(
  installmentId: string,
  orderId: string,
): Promise<{ ok: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Chưa đăng nhập" };
  // orders:manage chỉ HO_ACCOUNTANT (GLOBAL) — không cần target.
  if (!(await checkPermission("orders:manage"))) return { ok: false, error: "Không có quyền" };

  // R7-00 AC4 — chặn IDOR chéo cơ sở: xác nhận đơn nằm trong scope trước khi mutate.
  const actor = await resolveActor(session.user.id);
  const order = await scopedDb(actor).order.findUnique({
    where: { id: orderId },
    select: { id: true, centerId: true, leadId: true },
  });
  if (!order || !passesScope("Order", order, actor)) {
    return { ok: false, error: "Không tìm thấy đơn hàng" };
  }

  // Truyền orderId ĐÃ scope-check để lib đối chiếu installment thuộc đúng đơn
  // (chống IDOR: installmentId của đơn khác cơ sở).
  const res = await markInstallmentPaid(installmentId, session.user.id ?? null, order.id);
  if (res.ok) {
    revalidatePath(`/orders/${orderId}`);
    // S6 — đóng đợt sinh Payment(RECORDED, nếu đã duyệt) → đồng bộ trang lead/convert.
    if (order.leadId) {
      revalidatePath(`/leads/${order.leadId}`);
      revalidatePath(`/leads/${order.leadId}/convert`);
    }
  }
  return res;
}

// ─── Row type for client ─────────────────────────────────────────────
export type OrderRow = Awaited<ReturnType<typeof queryOrders>>["items"][number];
