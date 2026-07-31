"use server";

// BGĐ 31/07 — bridge server actions cho UI duyệt GIẢM GIÁ nhập tay.
// Cùng khuôn với _installment-approval-actions.ts: gate CHÍNH là `checkPermission`
// ở wrapper (theo cờ RBAC_V2 + shadow-diff); `assertCan` trong lib là lớp phòng thủ.
// Wrapper thêm auth + scopedDb (chống IDOR chéo cơ sở).

import { revalidatePath } from "next/cache";
import type { Session } from "next-auth";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/auth/check-permission";
import { resolveActor } from "@/lib/auth/actor";
import { scopedDb } from "@/lib/db-scope";
import { getAuditActor } from "@/lib/audit/log";
import {
  approveOrderDiscount,
  rejectOrderDiscount,
  type DiscountApprovalActor,
} from "@/lib/orders/discount";

type ActionResult = { ok: boolean; error?: string };

async function loadScopedOrder(orderId: string) {
  const session = await auth();
  if (!session?.user) return { error: "Chưa đăng nhập" as const };

  const actor = await resolveActor(session.user.id);
  const order = await scopedDb(actor).order.findUnique({
    where: { id: orderId },
    select: { id: true, centerId: true, leadId: true },
  });
  if (!order) return { error: "Không tìm thấy đơn hàng" as const };
  return { session, order } as const;
}

function buildActor(session: Session): DiscountApprovalActor {
  const { actorId, actorName } = getAuditActor(session);
  return {
    id: actorId ?? "",
    name: actorName,
    role: session.user.role,
    roles: session.user.roles,
  };
}

function revalidate(orderId: string, leadId: string | null) {
  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/orders");
  if (leadId) {
    revalidatePath(`/leads/${leadId}`);
    revalidatePath(`/leads/${leadId}/convert`);
  }
}

/** Quản lý cơ sở duyệt giảm giá → đơn được phép xác nhận. */
export async function approveOrderDiscountAction(
  orderId: string,
  reason?: string,
): Promise<ActionResult> {
  const ctx = await loadScopedOrder(orderId);
  if ("error" in ctx) return { ok: false, error: ctx.error };
  if (!(await checkPermission("discounts:approve"))) {
    return { ok: false, error: "Không có quyền duyệt giảm giá" };
  }
  const res = await approveOrderDiscount({
    orderId,
    actor: buildActor(ctx.session),
    reason,
  });
  if (res.ok) revalidate(orderId, ctx.order.leadId);
  return res;
}

/** Quản lý cơ sở từ chối giảm giá (reason bắt buộc). */
export async function rejectOrderDiscountAction(
  orderId: string,
  reason: string,
): Promise<ActionResult> {
  const ctx = await loadScopedOrder(orderId);
  if ("error" in ctx) return { ok: false, error: ctx.error };
  if (!(await checkPermission("discounts:approve"))) {
    return { ok: false, error: "Không có quyền duyệt giảm giá" };
  }
  const res = await rejectOrderDiscount({
    orderId,
    actor: buildActor(ctx.session),
    reason,
  });
  if (res.ok) revalidate(orderId, ctx.order.leadId);
  return res;
}
