import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { ensureOrderPaymentRecorded } from "@/lib/finance/payment";
import { ensureParentAccountForOrder } from "@/lib/parents/provision";
import { sendEmailForTrigger } from "@/lib/email/trigger";
import { computeDueNow } from "@/lib/payments/due-now";
import { markInstallmentPaid } from "@/lib/orders/installments";
import { notifyOrderByZnsIfNoEmail } from "@/lib/notify/order";
import {
  decideSepayAction,
  extractOrderCode,
  isValidSepayAuth,
  type SepayWebhookPayload,
} from "@/lib/payments/sepay";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// =============================================================================
// BGĐ 31/07 — Webhook SePay: TIỀN VỀ → TỰ XÁC NHẬN ĐƠN.
//
// Luồng: khách quét QR (nội dung CK đã nhúng MÃ ĐƠN) → SePay đọc biến động số dư
// → POST về đây → khớp đơn theo mã → chuyển PENDING_PAYMENT sang CONFIRMED + ghi
// sổ Payment (cùng đường ensureOrderPaymentRecorded như xác nhận tay, giữ invariant
// marker [auto:order-confirm] — KHÔNG double-count với kế hoạch trả góp).
//
// CẤU HÌNH: env `SEPAY_WEBHOOK_API_KEY` (SePay gửi `Authorization: Apikey <key>`).
// Thiếu env → từ chối tất cả (không mở cửa khi chưa cấu hình).
//
// Không khớp / trả thiếu / giảm giá chưa duyệt → KHÔNG tự xác nhận, ghi
// IntegrationLog(provider "SEPAY") để kế toán đối soát tay.
// =============================================================================

const SYSTEM_ACTOR = { id: null, name: "SePay webhook" };

async function logIntegration(params: {
  action: string;
  status: "SUCCESS" | "SKIPPED" | "FAILED";
  payload: unknown;
  error?: string;
}) {
  await db.integrationLog
    .create({
      data: {
        provider: "SEPAY",
        direction: "PULL",
        action: params.action,
        status: params.status,
        requestPayload: (params.payload ?? {}) as Prisma.InputJsonValue,
        errorMessage: params.error ?? null,
      },
    })
    .catch(() => {});
}

export async function POST(req: NextRequest) {
  if (!isValidSepayAuth(req.headers.get("authorization"))) {
    // Không ghi log payload khi chưa xác thực (chống spam/log injection).
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  let payload: SepayWebhookPayload;
  try {
    payload = (await req.json()) as SepayWebhookPayload;
  } catch {
    return NextResponse.json({ success: false, message: "Invalid JSON" }, { status: 400 });
  }

  const orderCode = extractOrderCode(payload.content ?? payload.description);
  const order = orderCode
    ? await db.order.findUnique({
        where: { code: orderCode },
        select: {
          id: true,
          code: true,
          status: true,
          totalAmount: true,
          centerId: true,
          leadId: true,
          gatewayTxnId: true,
          discountApprovalStatus: true,
          installmentApprovalStatus: true,
          installments: { select: { soDot: true, amount: true, status: true } },
        },
      })
    : null;

  // Số phải thu NGAY: khách chọn 2 đợt thì là đợt 1, không phải tổng đơn — dùng
  // đúng con số mà QR đã in ra (lib/payments/due-now.ts) để đối khớp.
  const paidAgg = order
    ? await db.payment.aggregate({
        where: { orderId: order.id, saleStatus: "RECORDED", deletedAt: null },
        _sum: { amount: true },
      })
    : null;
  const dueNow = order
    ? computeDueNow({
        totalAmount: order.totalAmount,
        paidAmount: paidAgg?._sum.amount ?? 0,
        installments: order.installments,
        installmentApprovalStatus: order.installmentApprovalStatus,
      })
    : null;

  const decision = decideSepayAction({ payload, order, dueNow: dueNow ?? undefined });

  if (decision.action !== "CONFIRM") {
    await logIntegration({
      action: decision.action === "SKIP" ? "SKIP_TXN" : "MANUAL_REVIEW",
      status: decision.action === "SKIP" ? "SKIPPED" : "FAILED",
      payload,
      error: decision.reason,
    });
    // Luôn trả 200: SePay coi non-2xx là lỗi và retry mãi; các case này không
    // phải lỗi hệ thống mà là việc của người đối soát.
    return NextResponse.json({ success: true, handled: false, reason: decision.reason });
  }

  const txnId = payload.id != null ? String(payload.id) : null;

  try {
    await db.$transaction(async (tx) => {
      // Chốt chặn race: chỉ cập nhật khi đơn CÒN ở PENDING_PAYMENT (2 webhook
      // song song → chỉ 1 cái đổi được trạng thái).
      const upd = await tx.order.updateMany({
        where: { id: decision.orderId, status: "PENDING_PAYMENT" },
        data: {
          status: "CONFIRMED",
          confirmedAt: new Date(),
          paidAt: new Date(),
          bankReference: payload.referenceCode ?? null,
          gatewayTxnId: txnId,
        },
      });
      if (upd.count === 0) throw new Error("ORDER_ALREADY_HANDLED");

      await tx.orderStatusHistory.create({
        data: {
          orderId: decision.orderId,
          fromStatus: "PENDING_PAYMENT",
          toStatus: "CONFIRMED",
          changedByUserId: null,
          changedByName: "SePay webhook",
          reason: `Tự động xác nhận: tiền về ${decision.amount.toLocaleString("vi-VN")}đ${
            payload.referenceCode ? ` (ref ${payload.referenceCode})` : ""
          }`,
        },
      });

      // Ghi sổ kế toán y như đường xác nhận tay (idempotent theo marker).
      // ⚠️ Khách đóng theo ĐỢT: khoản phải ghi đúng số đợt vừa thu với marker
      // [auto:order-installment:dotN] — ghi bằng tổng đơn qua đường
      // [auto:order-confirm] là phá bất biến "2 nguồn auto-Payment loại trừ nhau"
      // (đợt 2 sau đó sẽ cộng chồng lên). Đợt do markInstallmentPaid lo, ngoài tx.
      if (decision.soDot == null) {
        const recorded = await tx.payment.aggregate({
          where: { orderId: decision.orderId, saleStatus: "RECORDED", deletedAt: null },
          _count: { _all: true },
        });
        if (recorded._count._all === 0) {
          await ensureOrderPaymentRecorded(tx, {
            orderId: decision.orderId,
            amount: decision.amount,
            leadId: order!.leadId,
            centerId: order!.centerId,
            actor: SYSTEM_ACTOR,
          });
        }
      }
    });

    // Đóng theo đợt → đánh dấu đợt vừa thu là PAID (hàm này tự ghi Payment với
    // marker theo soDot + tôn trọng trạng thái duyệt kế hoạch). Ngoài transaction
    // trên vì nó tự mở transaction riêng.
    if (decision.soDot != null) {
      const inst = order!.installments.find((i) => i.soDot === decision.soDot);
      const instRow = inst
        ? await db.orderInstallment.findFirst({
            where: { orderId: decision.orderId, soDot: decision.soDot },
            select: { id: true },
          })
        : null;
      if (instRow) {
        const res = await markInstallmentPaid(instRow.id, null, decision.orderId);
        if (!res.ok) console.error("[sepay] markInstallmentPaid:", res.error);
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown";
    const alreadyHandled = message === "ORDER_ALREADY_HANDLED";
    await logIntegration({
      action: alreadyHandled ? "SKIP_TXN" : "CONFIRM_ORDER",
      status: alreadyHandled ? "SKIPPED" : "FAILED",
      payload,
      error: alreadyHandled ? "Đơn đã được xử lý bởi luồng khác" : message,
    });
    // Lỗi thật → 500 để SePay retry; đã xử lý rồi → 200.
    return NextResponse.json(
      { success: alreadyHandled, handled: false, reason: message },
      { status: alreadyHandled ? 200 : 500 },
    );
  }

  // BGĐ 31/07 — tiền về + đơn xác nhận → cấp tài khoản phụ huynh theo SĐT + ZNS.
  // Await (không fire-and-forget) vì serverless có thể kết thúc process sau response.
  await ensureParentAccountForOrder(decision.orderId).catch((err) =>
    console.error("[sepay] provision parent:", err),
  );

  // BIÊN NHẬN — mirror đúng đường xác nhận TAY (`changeOrderStatusAction`): email
  // PAYMENT_RECEIPT cho khách có email, ZNS học phí cho khách chỉ có SĐT.
  // Trước bản vá này webhook chỉ cấp tài khoản rồi im — khách chuyển khoản tự động
  // không nhận được bất kỳ xác nhận nào, trong khi khách thu tay thì có.
  // Await từng bước: trên serverless, promise chưa xong lúc trả response có thể bị
  // cắt giữa chừng (đúng lý do dòng provision ở trên cũng await).
  await sendOrderReceipt(decision.orderId);

  await logIntegration({ action: "CONFIRM_ORDER", status: "SUCCESS", payload });
  return NextResponse.json({ success: true, handled: true, orderCode });
}

/**
 * Gửi biên nhận cho đơn vừa xác nhận. Best-effort: mọi lỗi chỉ log — tiền đã ghi
 * sổ xong, không được để khâu thông báo làm webhook trả 500 rồi SePay retry và
 * đẩy đơn qua nhánh ORDER_ALREADY_HANDLED.
 */
async function sendOrderReceipt(orderId: string): Promise<void> {
  const order = await db.order
    .findUnique({
      where: { id: orderId },
      select: {
        id: true,
        code: true,
        customerEmail: true,
        customerName: true,
        totalAmount: true,
        paidAt: true,
        paymentMethod: { select: { name: true } },
      },
    })
    .catch(() => null);
  if (!order) return;

  if (order.customerEmail?.trim()) {
    await sendEmailForTrigger({
      trigger: "PAYMENT_RECEIPT",
      recipient: { email: order.customerEmail, name: order.customerName },
      vars: {
        customer_name: order.customerName,
        order_code: order.code,
        total_amount: order.totalAmount,
        payment_method: order.paymentMethod?.name ?? "Chuyển khoản (SePay)",
        paid_at: order.paidAt ?? new Date(),
      },
      context: { type: "Order", id: order.id },
      triggerType: "SYSTEM",
      actor: { userId: null, name: SYSTEM_ACTOR.name },
    }).catch((err) => console.error("[sepay] PAYMENT_RECEIPT email:", err));
  }

  // Khách không có email → ZNS mẫu học phí (helper tự bỏ qua khi có email, nên
  // gọi vô điều kiện vẫn không gửi trùng — nhưng gọi trong nhánh cho rõ ý).
  await notifyOrderByZnsIfNoEmail(order.id).catch((err) =>
    console.error("[sepay] ZNS receipt:", err),
  );
}
