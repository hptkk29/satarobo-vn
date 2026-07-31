import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { ensureOrderPaymentRecorded } from "@/lib/finance/payment";
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
        },
      })
    : null;

  const decision = decideSepayAction({ payload, order });

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
      const recorded = await tx.payment.aggregate({
        where: { orderId: decision.orderId, saleStatus: "RECORDED", deletedAt: null },
        _count: { _all: true },
      });
      if (recorded._count._all === 0) {
        await ensureOrderPaymentRecorded(tx, {
          orderId: decision.orderId,
          amount: order!.totalAmount,
          leadId: order!.leadId,
          centerId: order!.centerId,
          actor: SYSTEM_ACTOR,
        });
      }
    });
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

  await logIntegration({ action: "CONFIRM_ORDER", status: "SUCCESS", payload });
  return NextResponse.json({ success: true, handled: true, orderCode });
}
