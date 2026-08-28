/**
 * Site Sale — MOUNT LẠI màn "Hồ sơ của tôi" (bản admin: `/admin/settings`).
 *
 * ⚠️ CỐ Ý KHÔNG GÁC CỔNG QUYỀN — đây là ngoại lệ DUY NHẤT trong nhóm màn mount
 * lại, và không phải sơ suất:
 *
 *   Màn này hiển thị hồ sơ và ô đổi mật khẩu CỦA CHÍNH NGƯỜI ĐANG ĐĂNG NHẬP.
 *   Gác `chanNeuThieuQuyen` ở đây là khoá người dùng khỏi chính họ: ai chưa được
 *   cấp thêm quyền nào sẽ không xem nổi tên mình và không đổi nổi mật khẩu mình.
 *   Đăng nhập được là điều kiện đủ — bản admin cũng chỉ kiểm `auth()`, không
 *   kiểm quyền nào.
 *
 * Vì vậy `/sale/ho-so` KHÔNG có mặt trong `PAGE_GATES` — và cũng đừng thêm vào:
 * `chanNeuThieuQuyen` coi đường không khai là CHƯA CÓ CỔNG rồi chặn, nên chỉ cần
 * khai vào bảng là màn này chết ngay cả khi không ai gọi cổng.
 *
 * Bản admin không nhận props nào, nên wrapper cũng không nhận.
 */
import AdminSettingsPage from "@/app/(admin)/admin/settings/page";

export const dynamic = "force-dynamic";
export const metadata = { title: "Hồ sơ của tôi | Tư vấn tuyển sinh" };

export default async function SaleProfilePage() {
  return <AdminSettingsPage />;
}
