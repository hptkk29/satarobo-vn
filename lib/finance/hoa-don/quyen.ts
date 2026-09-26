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

/**
 * Tải được tệp của MỘT bản hoá đơn không — luật DUY NHẤT, dùng chung cho route
 * `payments/hoa-don/[hoaDonId]/tai-ve` VÀ nút tải trên trang chi tiết đơn (GĐ 7). Hai bên giữ
 * hai bản điều kiện thì có ngày nút hiện ra mà route trả 404 — lời hứa suông (luật 12).
 *   · kế toán của ĐÚNG cơ sở giữ hoá đơn — mọi bản (nháp để soát, bản bị thay để đối chiếu);
 *   · người có `orders:view-pii` — CHỈ bản ĐÃ XÁC NHẬN (nháp có thể sai; sale gửi qua Zalo thì
 *     không thu về được).
 * Người gọi đã giải sẵn `keToanCoSo` = `payments:confirm` (trần) VÀ `coQuyenKeToanTaiCoSo`.
 * ⚠️ Chưa gồm phạm vi `scopedDb`: route đọc bản ghi qua `scopedDb` (ngoài phạm vi ⇒ 404 trước khi
 * tới đây) — nơi vẽ nút phải tự hỏi `passesScope("HoaDonDienTu", …)`.
 */
export function duocTaiBanHoaDon(input: { keToanCoSo: boolean; xemPii: boolean; trangThai: string }): boolean {
  return input.keToanCoSo || (input.xemPii && input.trangThai === "DA_XAC_NHAN");
}
