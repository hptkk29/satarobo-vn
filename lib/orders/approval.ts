import "server-only";
import { db } from "@/lib/db";
import { assertCan, type Action } from "@/lib/auth/permissions";
import {
  applyDiscountApproval,
  applyDiscountRejection,
  type DiscountApprovalActor,
} from "@/lib/orders/discount";
import {
  applyInstallmentApproval,
  applyInstallmentRejection,
} from "@/lib/orders/installments";

// =============================================================================
// DUYỆT CẢ ĐƠN BẰNG MỘT NÚT (chủ dự án chốt 20/08/2026).
//
// Trước đây quản lý cơ sở phải bấm duyệt HAI lần cho cùng một đơn: một lần cho
// khoản giảm giá, một lần cho kế hoạch thanh toán 2 đợt. Hai lần bấm đó không mang
// thêm quyết định nào — người duyệt nhìn đúng một tờ đơn và trả lời đúng một câu
// "đồng ý bán với giá này, thu theo lịch này". Tách đôi chỉ đẻ ra trạng thái nửa
// vời: đơn được duyệt giảm giá xong nằm đó chờ người ta nhớ quay lại duyệt nốt
// kế hoạch, mà mã QR theo đợt lại chỉ ra đời ở lần bấm thứ hai.
//
// KHÔNG ĐỔI SCHEMA. Hai cột `discountApprovalStatus` / `installmentApprovalStatus`
// giữ nguyên; "gộp" nằm ở tầng hành động: một lệnh đặt cả hai cột trong CÙNG một
// transaction. Giữ hai cột vì (a) vẫn cần biết đơn phải duyệt VÌ LÝ DO GÌ khi đối
// soát về sau, (b) đảo lại quyết định này chỉ tốn phần giao diện.
//
// TÊN HÀNH ĐỘNG NHẬT KÝ GIỮ NGUYÊN (DISCOUNT_APPROVED / INSTALLMENT_APPROVED, và
// hai bản REJECTED) — báo cáo và lịch sử đơn đang đọc theo tên đó.
// =============================================================================

/** Hai nội dung có thể phải duyệt trên một đơn. */
export type ApprovalPart = "discount" | "installment";

/** Quyền tương ứng từng nội dung. QLCS giữ CẢ HAI; kế toán Hội sở cũng vậy. */
export const APPROVAL_PART_PERMISSION: Record<ApprovalPart, Action> = {
  discount: "discounts:approve",
  installment: "installments:approve",
};

/** Nhãn tiếng Việt để ghép câu báo lỗi cho người vận hành. */
export const APPROVAL_PART_LABEL: Record<ApprovalPart, string> = {
  discount: "giảm giá",
  installment: "kế hoạch thanh toán",
};

/** Actor cho luồng duyệt gộp — cùng hình dạng với hai luồng lẻ. */
export type OrderApprovalActor = DiscountApprovalActor;

export const NOTHING_TO_APPROVE = "Đơn này không có nội dung nào đang chờ duyệt";

/**
 * THUẦN — đơn đang chờ duyệt những nội dung nào.
 *
 * Chỉ tính `PENDING_APPROVAL`. Đơn đã bị TỪ CHỐI không tự động quay lại hàng chờ:
 * người lập đơn phải sửa rồi bấm "Yêu cầu duyệt lại" — nếu không, một cú bấm
 * "Duyệt đơn" sẽ lặng lẽ hồi sinh đúng cái giá mà quản lý vừa bác.
 */
export function pendingApprovalParts(order: {
  discountApprovalStatus?: string | null;
  installmentApprovalStatus?: string | null;
}): ApprovalPart[] {
  const parts: ApprovalPart[] = [];
  if (order.discountApprovalStatus === "PENDING_APPROVAL") parts.push("discount");
  if (order.installmentApprovalStatus === "PENDING_APPROVAL") parts.push("installment");
  return parts;
}

/** THUẦN — trong các nội dung đang chờ, nội dung nào actor KHÔNG được phép duyệt. */
export function missingApprovalPermissions(
  parts: readonly ApprovalPart[],
  granted: Partial<Record<ApprovalPart, boolean>>,
): ApprovalPart[] {
  return parts.filter((p) => granted[p] !== true);
}

/**
 * THUẦN — câu báo lỗi khi thiếu quyền.
 *
 * Nói rõ THIẾU CÁI GÌ chứ không chỉ "không có quyền": người bị chặn thường là kế
 * toán hoặc quản lý mới, họ cần biết phải xin quyền nào hoặc nhờ ai bấm hộ.
 */
export function describeMissingPermissions(missing: readonly ApprovalPart[]): string {
  const labels = missing.map((p) => APPROVAL_PART_LABEL[p]).join(" và ");
  return `Không đủ quyền duyệt đơn này — thiếu quyền duyệt ${labels}. Đơn được duyệt một lần cho toàn bộ nội dung, nên phải nhờ người có đủ quyền bấm duyệt.`;
}

/** Tra quyền bằng matrix v1 (lớp phòng thủ trong lib — gate CHÍNH ở server action). */
function grantsByAssertCan(
  actor: OrderApprovalActor,
  parts: readonly ApprovalPart[],
): Partial<Record<ApprovalPart, boolean>> {
  const user = { role: actor.role ?? null, roles: actor.roles ?? undefined };
  const granted: Partial<Record<ApprovalPart, boolean>> = {};
  for (const part of parts) {
    try {
      assertCan(user, APPROVAL_PART_PERMISSION[part]);
      granted[part] = true;
    } catch {
      granted[part] = false;
    }
  }
  return granted;
}

type PendingOrder = {
  id: string;
  centerId: string | null;
  leadId: string | null;
  discountApprovalStatus: "PENDING_APPROVAL" | "APPROVED" | "REJECTED" | null;
  installmentApprovalStatus: "PENDING_APPROVAL" | "APPROVED" | "REJECTED" | null;
};

async function loadPendingOrder(orderId: string): Promise<PendingOrder | null> {
  return db.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      centerId: true,
      leadId: true,
      discountApprovalStatus: true,
      installmentApprovalStatus: true,
    },
  });
}

export type OrderApprovalResult = {
  ok: boolean;
  error?: string;
  /** Những nội dung THỰC SỰ đã đổi trạng thái trong lệnh này. */
  parts?: ApprovalPart[];
};

/**
 * Duyệt CẢ ĐƠN: đặt cả hai cột (phần nào đang chờ) trong MỘT transaction.
 *
 * Quyền là quy tắc "tất cả hoặc không": thiếu quyền cho MỘT nội dung đang chờ thì
 * cả lệnh bị từ chối. Duyệt được nửa đơn là lỗ hổng quy trình — người chỉ được
 * duyệt trả góp sẽ thông qua luôn đơn có giảm giá vượt khung mà không ai ký.
 */
export async function approveOrder(params: {
  orderId: string;
  actor: OrderApprovalActor;
  reason?: string;
}): Promise<OrderApprovalResult> {
  const order = await loadPendingOrder(params.orderId);
  if (!order) return { ok: false, error: "Không tìm thấy đơn" };

  const parts = pendingApprovalParts(order);
  if (parts.length === 0) return { ok: false, error: NOTHING_TO_APPROVE };

  const missing = missingApprovalPermissions(parts, grantsByAssertCan(params.actor, parts));
  if (missing.length > 0) return { ok: false, error: describeMissingPermissions(missing) };

  await db.$transaction(async (tx) => {
    if (parts.includes("discount")) {
      await applyDiscountApproval(tx, {
        order,
        actor: params.actor,
        reason: params.reason,
      });
    }
    if (parts.includes("installment")) {
      await applyInstallmentApproval(tx, {
        order,
        actor: params.actor,
        reason: params.reason,
      });
    }
  });
  return { ok: true, parts };
}

/**
 * Từ chối CẢ ĐƠN (lý do bắt buộc) — cùng quy tắc quyền và cùng transaction.
 *
 * Giữ nguyên hiệu ứng phụ của việc bác kế hoạch: phiếu thu theo đợt bị thu hồi và
 * phiếu "thu toàn đơn" sống lại, để đơn vẫn thu được tiền trong lúc lập lại kế hoạch.
 */
export async function rejectOrder(params: {
  orderId: string;
  actor: OrderApprovalActor;
  reason: string;
}): Promise<OrderApprovalResult> {
  if (!params.reason?.trim()) return { ok: false, error: "Lý do từ chối là bắt buộc" };

  const order = await loadPendingOrder(params.orderId);
  if (!order) return { ok: false, error: "Không tìm thấy đơn" };

  const parts = pendingApprovalParts(order);
  if (parts.length === 0) return { ok: false, error: NOTHING_TO_APPROVE };

  const missing = missingApprovalPermissions(parts, grantsByAssertCan(params.actor, parts));
  if (missing.length > 0) return { ok: false, error: describeMissingPermissions(missing) };

  await db.$transaction(async (tx) => {
    if (parts.includes("discount")) {
      await applyDiscountRejection(tx, {
        order,
        actor: params.actor,
        reason: params.reason,
      });
    }
    if (parts.includes("installment")) {
      await applyInstallmentRejection(tx, {
        order,
        actor: params.actor,
        reason: params.reason,
      });
    }
  });
  return { ok: true, parts };
}
