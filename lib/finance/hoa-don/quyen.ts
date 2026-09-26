// lib/finance/hoa-don/quyen.ts — "người này có phải KẾ TOÁN của cơ sở giữ đơn không". THUẦN.
//
// Vì sao cần hàm riêng (PLAN §9, đo ở GĐ 3):
//   · `checkPermission("payments:confirm", { centerId })` KHÔNG giới hạn được cơ sở: quyền seed GLOBAL,
//     nhánh GLOBAL của `can()` trả true bỏ qua target; ở v1 (local/CI) target bị bỏ qua hẳn.
//   · Tầm nhìn `scopedDb` là PHÉP HỢP theo tiền tố `payments:` — người kiêm kế toán CS1 + sale CS2
//     THẤY hoá đơn CS2.
// Nên cổng GHI (tải lên, xác nhận, không xuất, thay) và nhánh "tải bản NHÁP" hỏi tập cơ sở của
// ĐÚNG quyền `payments:confirm` — `centerScope` suy từ NƠI NEO VAI (lib/auth/actor.ts).
//
// ⚠️ Người gọi VẪN phải `checkPermission("payments:confirm")` (trần) trước — hàm này đọc
// `actor.permissions` (dữ liệu v2) và không tính bảng `PermissionGrant` mới; nó chỉ THU HẸP.
// ⚠️ Đặt ở đây chứ không so inline trong action: lint `no-restricted-syntax` cấm `.centerId ===`
// trong tệp action, và luật cứng #1 cấm điều kiện quyền inline.

import { actionCenterScope, type ActionScopeActor } from "@/lib/lms/report-card-core";

export const QUYEN_KE_TOAN_HOA_DON = "payments:confirm" as const;

export function coQuyenKeToanTaiCoSo(actor: ActionScopeActor, centerId: string | null): boolean {
  if (!centerId) return false;
  const tap = actionCenterScope(actor, QUYEN_KE_TOAN_HOA_DON);
  return tap === "ALL" || tap.includes(centerId);
}
