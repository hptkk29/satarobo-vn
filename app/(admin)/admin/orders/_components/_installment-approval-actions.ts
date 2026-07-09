"use server";

// OD1b — bridge server actions cho UI duyệt kế hoạch trả góp 2 đợt.
// Bọc các hàm lib SPINE (server-only) trong lib/orders/installments.ts để gọi từ
// client component. KHÔNG đặt trong orders/_actions.ts (file của SPINE) — file riêng,
// không đụng tới hàm của agent khác. Quyền: gate CHÍNH là `checkPermission` ở wrapper
// (theo cờ RBAC_V2 + sinh shadow-diff); `assertCan` trong lib là lớp phòng thủ cho caller
// gọi thẳng lib (e2e). Wrapper thêm auth + scope (chống IDOR chéo cơ sở).

import { revalidatePath } from "next/cache";
import type { Session } from "next-auth";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/auth/check-permission";
import { resolveActor } from "@/lib/auth/actor";
import { scopedDb } from "@/lib/db-scope";
import { getAuditActor } from "@/lib/audit/log";
import {
  requestInstallmentApproval,
  approveInstallmentPlan,
  rejectInstallmentPlan,
  type InstallmentApprovalActor,
} from "@/lib/orders/installments";

type ActionResult = { ok: boolean; error?: string };

async function loadScopedOrder(orderId: string) {
  const session = await auth();
  if (!session?.user) return { error: "Chưa đăng nhập" as const };

  // R7-00 AC4 — scopedDb.findUnique lọc hậu kỳ theo scope (IDOR chéo cơ sở → null).
  const actor = await resolveActor(session.user.id);
  const order = await scopedDb(actor).order.findUnique({
    where: { id: orderId },
    select: { id: true, centerId: true, leadId: true },
  });
  if (!order) {
    return { error: "Không tìm thấy đơn hàng" as const };
  }
  return { session, order } as const;
}

function buildApprovalActor(session: Session): InstallmentApprovalActor {
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
  // S6 — duyệt/từ chối đợt 2 ảnh hưởng "đủ điều kiện chốt" ở trang lead/convert.
  if (leadId) {
    revalidatePath(`/leads/${leadId}`);
    revalidatePath(`/leads/${leadId}/convert`);
  }
}

/** Sale (orders:manage trong ngữ cảnh trang đơn) yêu cầu QLCS duyệt kế hoạch 2 đợt. */
export async function requestInstallmentApprovalAction(
  orderId: string,
): Promise<ActionResult> {
  const ctx = await loadScopedOrder(orderId);
  if ("error" in ctx) return { ok: false, error: ctx.error };
  // orders:manage chỉ HO_ACCOUNTANT (GLOBAL) — không cần target.
  if (!(await checkPermission("orders:manage"))) {
    return { ok: false, error: "Không có quyền" };
  }
  const res = await requestInstallmentApproval({
    orderId,
    actor: buildApprovalActor(ctx.session),
  });
  if (res.ok) revalidate(orderId, ctx.order.leadId);
  return res;
}

/**
 * Duyệt kế hoạch 2 đợt. Gate CHÍNH đặt ở đây, không ở lib.
 *
 * `lib/orders/installments.ts` nhận `actor` thuần và gate bằng `assertCan` (matrix v1) —
 * nghĩa là nó KHÔNG theo cờ `RBAC_V2_ENABLED` và KHÔNG sinh shadow-diff. Hệ quả: mọi
 * thay đổi quyền ở v2 (vd chuyển `installments:approve` từ QL cơ sở sang kế toán Hội sở)
 * sẽ vô hiệu trên đường này. `checkPermission` ở đây mới là nơi cờ có hiệu lực; `assertCan`
 * trong lib giữ lại làm lớp phòng thủ cho caller khác (e2e gọi thẳng lib).
 */
export async function approveInstallmentPlanAction(
  orderId: string,
  reason?: string,
): Promise<ActionResult> {
  const ctx = await loadScopedOrder(orderId);
  if ("error" in ctx) return { ok: false, error: ctx.error };
  // GLOBAL scope (R1 — call-site gate chạy trước khi có centerId); cách ly cơ sở đã do
  // scopedDb lo ở loadScopedOrder.
  if (!(await checkPermission("installments:approve"))) {
    return { ok: false, error: "Không có quyền duyệt kế hoạch trả góp" };
  }
  const res = await approveInstallmentPlan({
    orderId,
    actor: buildApprovalActor(ctx.session),
    reason,
  });
  if (res.ok) revalidate(orderId, ctx.order.leadId);
  return res;
}

/** Từ chối kế hoạch 2 đợt (reason bắt buộc). Gate chính ở đây — xem chú thích approve. */
export async function rejectInstallmentPlanAction(
  orderId: string,
  reason: string,
): Promise<ActionResult> {
  const ctx = await loadScopedOrder(orderId);
  if ("error" in ctx) return { ok: false, error: ctx.error };
  if (!(await checkPermission("installments:approve"))) {
    return { ok: false, error: "Không có quyền duyệt kế hoạch trả góp" };
  }
  const res = await rejectInstallmentPlan({
    orderId,
    actor: buildApprovalActor(ctx.session),
    reason,
  });
  if (res.ok) revalidate(orderId, ctx.order.leadId);
  return res;
}
