"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { Prisma, type OrderStatus, type OrderType } from "@prisma/client";
import { auth } from "@/lib/auth";
import { can } from "@/lib/auth/permissions";
import { resolveActor } from "@/lib/auth/actor";
import { passesScope } from "@/lib/db-scope";
import { db } from "@/lib/db";
import {
  orderCreateManualSchema,
  orderStatusChangeSchema,
} from "@/lib/validators/order";
import { generateOrderCode, withUniqueRetry } from "@/lib/orders/code";
import { canTransition } from "@/lib/orders/status";
import { recordInstallmentPlan, markInstallmentPaid } from "@/lib/orders/installments";
import { getRequestMetadata } from "@/lib/audit/headers";
import { getAuditActor } from "@/lib/audit/log";
import { validateAndComputeDiscount } from "@/lib/vouchers/compute";
import { sendEmailForTrigger } from "@/lib/email/trigger";
import { renderTemplate } from "@/lib/email/render";
import { sendEmail } from "@/lib/email/send";

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

  // Voucher: validate + compute discount BEFORE total calculation.
  // Server is source of truth — discountAmount sent from UI is overridden
  // when a valid voucher code is provided.
  let voucherInfo: {
    voucherId: string;
    voucherCode: string;
    discountAmount: number;
  } | null = null;

  if (data.voucherCode?.trim()) {
    // For PRODUCT orders, pass productId so KIT_ROBOT/SENSOR vouchers can
    // verify category match.
    const productIdForVoucher =
      data.type === "PRODUCT" ? (data.items[0]?.productId ?? null) : null;

    const voucherResult = await validateAndComputeDiscount({
      code: data.voucherCode,
      orderType: data.type,
      subtotal,
      customerPhone: data.customerPhone,
      productId: productIdForVoucher,
    });

    if (!voucherResult.ok) {
      return {
        ok: false as const,
        error: `Voucher: ${voucherResult.message}`,
      };
    }

    voucherInfo = {
      voucherId: voucherResult.voucherId,
      voucherCode: voucherResult.voucherCode,
      discountAmount: voucherResult.discountAmount,
    };
    data.discountAmount = voucherResult.discountAmount;
  }

  const totalAmount = subtotal - data.discountAmount + data.shippingFee;
  if (totalAmount < 0) {
    return { ok: false as const, error: "Tổng tiền không thể âm" };
  }

  const pm = await db.paymentMethod.findUnique({
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
    const product = await db.product.findUnique({
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
  const created = await withUniqueRetry(() =>
    db.$transaction(async (tx) => {
      const code = await generateOrderCode(tx);
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
        voucherCode: voucherInfo?.voucherCode ?? data.voucherCode?.trim() ?? null,
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

    // Voucher redemption + atomic increment (Sprint 5.7.1).
    if (voucherInfo) {
      await tx.voucherRedemption.create({
        data: {
          voucherId: voucherInfo.voucherId,
          orderId: order.id,
          customerPhone: data.customerPhone.trim(),
          customerId: null, // manual orders không có User account
          discountApplied: voucherInfo.discountAmount,
        },
      });

      // Atomic increment + race-condition guard. Nếu 2 đơn cùng vớt
      // voucher cuối cùng, tx sẽ rollback nhánh thứ 2.
      const updated = await tx.voucher.update({
        where: { id: voucherInfo.voucherId },
        data: { usedCount: { increment: 1 } },
        select: { usedCount: true, quantity: true },
      });

      if (updated.quantity != null && updated.usedCount > updated.quantity) {
        throw new Error("VOUCHER_QUANTITY_EXCEEDED_RACE");
      }
    }

      return order;
    }),
  );

  revalidatePath("/orders");
  if (productSnapshot) {
    revalidatePath("/products");
    revalidatePath(`/products/${productSnapshot.productId}`);
  }
  if (voucherInfo) {
    revalidatePath("/vouchers");
    revalidatePath(`/vouchers/${voucherInfo.voucherId}`);
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

// ─── PREVIEW VOUCHER (no DB write) ──────────────────────────────────
export async function previewVoucherAction(input: {
  code: string;
  orderType: OrderType;
  subtotal: number;
  customerPhone: string;
  productId?: string | null;
}) {
  await requireOrdersManage();

  if (!input.code?.trim()) {
    return { ok: false as const, error: "Vui lòng nhập mã voucher" };
  }
  if (!input.customerPhone?.trim()) {
    return { ok: false as const, error: "Vui lòng nhập SĐT khách trước" };
  }
  if (input.subtotal <= 0) {
    return { ok: false as const, error: "Vui lòng chọn sản phẩm trước" };
  }

  const result = await validateAndComputeDiscount({
    ...input,
    productId: input.productId ?? null,
  });
  if (!result.ok) {
    return { ok: false as const, error: result.message };
  }

  return {
    ok: true as const,
    voucherId: result.voucherId,
    voucherCode: result.voucherCode,
    voucherName: result.voucherName,
    discountAmount: result.discountAmount,
  };
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

  const order = await db.order.findUnique({
    where: { id: orderId },
    select: { id: true, status: true, centerId: true },
  });
  const actor = await resolveActor(session.user.id);
  if (!order || !passesScope("Order", order, actor)) {
    return { ok: false as const, error: "Không tìm thấy đơn hàng" };
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

  const txResult = await db.$transaction(async (tx) => {
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
    return { stale: false as const };
  });

  if (txResult.stale) return { ok: false as const, error: "STALE_WRITE" };

  revalidatePath("/orders");
  revalidatePath(`/orders/${orderId}`);

  // Fire PAYMENT_RECEIPT when order transitions to CONFIRMED (paidAt set).
  if (parsed.data.toStatus === "CONFIRMED") {
    const orderForEmail = await db.order.findUnique({
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

  const order = await db.order.findUnique({
    where: { id: orderId },
    select: { id: true, centerId: true },
  });
  const actor = await resolveActor(session.user.id);
  if (!order || !passesScope("Order", order, actor)) {
    return { ok: false as const, error: "Không tìm thấy đơn hàng" };
  }

  const expectedAt = expectedUpdatedAt ? new Date(expectedUpdatedAt) : null;
  // FIX-H9 — ghi có điều kiện updatedAt; 0 row ⇒ người khác vừa sửa → STALE_WRITE.
  const upd = await db.order.updateMany({
    where: { id: orderId, ...(expectedAt ? { updatedAt: expectedAt } : {}) },
    data: { internalNote: internalNote.trim() || null },
  });
  if (upd.count === 0) return { ok: false as const, error: "STALE_WRITE" };

  revalidatePath(`/orders/${orderId}`);
  return { ok: true as const };
}

// ─── HELPER: load form data cho create page ─────────────────────────
export async function loadCreateOrderFormData() {
  await requireOrdersManage();

  const [paymentMethods, courses, packages, products, centers] =
    await Promise.all([
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
        // E2-ORDER (item 3): chỉ khoá DẠY thật (Sata 1–8...), loại 2 "danh mục"
        // Lập trình Robot / Luyện thi RoboSim (isTeachable=false). Combo đi qua loại đơn PACKAGE.
        where: { isActive: true, isPublished: true, isTeachable: true },
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
      db.product.findMany({
        where: { status: "ACTIVE" },
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
      db.center.findMany({
        where: { isActive: true },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      }),
    ]);

  return { paymentMethods, courses, packages, products, centers };
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

  const [template, order] = await Promise.all([
    db.emailTemplate.findUnique({ where: { id: input.templateId } }),
    db.order.findUnique({
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
  const actor = await resolveActor(session.user.id);
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
}): Promise<{ ok: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Chưa đăng nhập" };
  if (!can(session.user, "orders:manage")) return { ok: false, error: "Không có quyền" };

  const order = await db.order.findUnique({
    where: { id: input.orderId },
    select: { id: true, centerId: true },
  });
  const actor = await resolveActor(session.user.id);
  if (!order || !passesScope("Order", order, actor)) {
    return { ok: false, error: "Không tìm thấy đơn hàng" };
  }

  const res = await recordInstallmentPlan({
    orderId: input.orderId,
    dot1Amount: Math.round(input.dot1Amount),
    dot2Amount: Math.round(input.dot2Amount),
    dot2DueDate: input.dot2DueDate ? new Date(input.dot2DueDate) : null,
    actorId: session.user.id ?? null,
  });
  if (res.ok) revalidatePath(`/orders/${input.orderId}`);
  return res;
}

export async function markOrderInstallmentPaidAction(
  installmentId: string,
  orderId: string,
): Promise<{ ok: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Chưa đăng nhập" };
  if (!can(session.user, "orders:manage")) return { ok: false, error: "Không có quyền" };

  // R7-00 AC4 — chặn IDOR chéo cơ sở: xác nhận đơn nằm trong scope trước khi mutate.
  const order = await db.order.findUnique({
    where: { id: orderId },
    select: { id: true, centerId: true },
  });
  const actor = await resolveActor(session.user.id);
  if (!order || !passesScope("Order", order, actor)) {
    return { ok: false, error: "Không tìm thấy đơn hàng" };
  }

  const res = await markInstallmentPaid(installmentId, session.user.id ?? null);
  if (res.ok) revalidatePath(`/orders/${orderId}`);
  return res;
}

// ─── Row type for client ─────────────────────────────────────────────
export type OrderRow = Awaited<ReturnType<typeof queryOrders>>["items"][number];
