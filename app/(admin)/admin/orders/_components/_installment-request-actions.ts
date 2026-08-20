"use server";

// OD1b — SALE XIN DUYỆT LẠI kế hoạch trả góp 2 đợt. KHÔNG phải đường duyệt.
//
// ⚠️ VÌ SAO FILE NÀY TỒN TẠI RIÊNG (20/08/2026): `lib/orders/approval.ts` tuyên bố
// bất biến "tất cả hoặc không" — không ai được duyệt NỬA đơn (giảm giá đã ký mà kế
// hoạch còn treo, hoặc ngược lại). Nhưng trước đó `requestInstallmentApprovalAction`
// nằm chung file với `approveInstallmentPlanAction` / `rejectInstallmentPlanAction`;
// MỌI export của file "use server" là một endpoint HTTP có action id, nên chỉ cần
// order-detail-client import một hàm trong file là Next đăng ký luôn cả hai hàm duyệt
// LẺ kia. Người chỉ có `installments:approve` POST thẳng vào endpoint đó là duyệt
// được nửa đơn (và sinh luôn phiếu thu theo đợt) — bất biến khi ấy chỉ còn dựa vào
// TRÙNG HỢP là các vai đang giữ cả hai quyền, chứ không dựa vào code.
//
// Cách chữa: tách hàm "xin duyệt" ra file riêng này và XOÁ HẲN hai hàm duyệt lẻ.
// Đường duyệt duy nhất còn lại là `approveOrderAction` / `rejectOrderAction` trong
// `../duyet/_actions.ts` (duyệt cả đơn, một transaction, đòi đủ quyền cho mọi phần
// đang chờ). Đừng thêm hàm duyệt lẻ nào vào đây nữa.
//
// Quyền: gate CHÍNH là `checkPermission` ở wrapper (theo cờ RBAC_V2 + sinh
// shadow-diff); `assertCan` trong lib là lớp phòng thủ cho caller gọi thẳng lib (e2e).
// Wrapper thêm auth + scopedDb (chống IDOR chéo cơ sở).

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/auth/check-permission";
import { resolveActor } from "@/lib/auth/actor";
import { scopedDb } from "@/lib/db-scope";
import { getAuditActor } from "@/lib/audit/log";
import { requestInstallmentApproval } from "@/lib/orders/installments";

type ActionResult = { ok: boolean; error?: string };

/** Sale (orders:manage trong ngữ cảnh trang đơn) yêu cầu QLCS duyệt kế hoạch 2 đợt. */
export async function requestInstallmentApprovalAction(
  orderId: string,
): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Chưa đăng nhập" };
  // orders:manage chỉ HO_ACCOUNTANT (GLOBAL) — không cần target. Kiểm TRƯỚC khi tra
  // đơn: thiếu quyền thì mọi id phải trả về cùng một câu, đừng để thông điệp lỗi
  // phân biệt được đơn có thật với đơn không tồn tại.
  if (!(await checkPermission("orders:manage"))) {
    return { ok: false, error: "Không có quyền" };
  }

  // R7-00 AC4 — scopedDb.findUnique lọc hậu kỳ theo scope (IDOR chéo cơ sở → null).
  const actor = await resolveActor(session.user.id);
  const order = await scopedDb(actor).order.findUnique({
    where: { id: orderId },
    select: { id: true, leadId: true },
  });
  if (!order) return { ok: false, error: "Không tìm thấy đơn hàng" };

  const { actorId, actorName } = getAuditActor(session);
  const res = await requestInstallmentApproval({
    orderId,
    actor: {
      id: actorId ?? "",
      name: actorName,
      role: session.user.role,
      roles: session.user.roles,
    },
  });
  if (res.ok) {
    revalidatePath(`/orders/${orderId}`);
    // S6 — xin duyệt lại đổi trạng thái "đủ điều kiện chốt" ở trang lead/convert.
    if (order.leadId) {
      revalidatePath(`/leads/${order.leadId}`);
      revalidatePath(`/leads/${order.leadId}/convert`);
    }
  }
  return res;
}
