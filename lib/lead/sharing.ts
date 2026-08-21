// lib/lead/sharing.ts — Đợt E (22/08/2026): lead độc quyền tuyệt đối.
//
// Chủ dự án chốt Q8 (21/08): bỏ tính năng "dùng chung lead trong cơ sở".
//
// ⚠️ ĐÂY LÀ ĐẢO MỘT QUYẾT ĐỊNH ĐÃ KÝ của chính chủ dự án — BGĐ câu 10, ký
// 10/07/2026 — và tính năng ĐANG CHẠY TRÊN PROD. Người đang dựa vào nó sẽ mất
// quyền xem ngay ngày cờ này có hiệu lực. Vì vậy gỡ theo 2 pha:
//
//   Pha 1 (đợt này): ngừng tôn trọng cờ ở tầng ĐỌC + ẩn nút bật/tắt.
//                    **GIỮ nguyên cột `Lead.isSharedWithTeam` và dữ liệu.**
//   Pha 2 (sau, nếu chắc chắn không đảo lại): mới bàn tới việc bỏ cột.
//
// Bật lại = đặt env `LEAD_SHARING_ENABLED="true"` + redeploy. Không revert code,
// không mất dữ liệu — vì đây là quyết định về CHÍNH SÁCH, mà chính sách thì đổi.
import { isLeadSharingEnabled } from "@/lib/flags";

/**
 * Ai được mở một lead. THUẦN — nhận sẵn mọi dữ kiện, để test được và để quy tắc
 * nằm ở MỘT chỗ thay vì lặp lại trong từng trang.
 *
 * `sharingEnabled` truyền vào tường minh (không đọc env bên trong) để test không
 * phụ thuộc môi trường; tầng gọi dùng `leadSharingEnabled()` bên dưới.
 */
export function canSeeLead(input: {
  /** Có `leads:view-all` — quản lý/CRM nhìn toàn bộ lead trong tầm nhìn cơ sở. */
  canViewAll: boolean;
  /** Người xem chính là người phụ trách lead. */
  isOwner: boolean;
  /** Lead đang bật cờ "dùng chung" (dữ liệu cũ vẫn còn). */
  isShared: boolean;
  /** Chính sách chia sẻ lead có đang bật không. */
  sharingEnabled: boolean;
}): boolean {
  if (input.canViewAll || input.isOwner) return true;
  return input.sharingEnabled && input.isShared;
}

/** Đọc chính sách hiện hành. Tách ra để trang/action không import cờ rải rác. */
export function leadSharingEnabled(): boolean {
  return isLeadSharingEnabled();
}

/**
 * Mệnh đề `OR` bổ sung cho truy vấn danh sách lead — rỗng khi chính sách đã tắt.
 *
 * Dùng trải (`...`) vào mảng `OR` đang có, để chỗ gọi không phải viết điều kiện
 * ba ngôi và không ai quên cập nhật khi chính sách đổi.
 */
export function leadSharedOrClause(): { isSharedWithTeam: true }[] {
  return isLeadSharingEnabled() ? [{ isSharedWithTeam: true }] : [];
}
