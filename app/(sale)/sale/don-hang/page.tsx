/**
 * Site Sale — MOUNT LẠI màn "Đơn hàng" của khu quản trị.
 *
 * KHUÔN MẪU cho các màn mount lại khác. Ba điều bắt buộc:
 *
 *   1. Cổng `chanNeuThieuQuyen` chạy TRƯỚC. Thiếu quyền thì trả màn "không có
 *      quyền" của site Sale, KHÔNG để rơi vào `redirect("/dashboard")` bên trong
 *      trang admin — đường đó là **404 trên host Sale** (xem `lib/sale/cong-trang.tsx`).
 *
 *   2. Dùng lại ĐÚNG component của admin, KHÔNG chép nội dung sang. Chép là hai
 *      bản sẽ trôi lệch và người sửa chỉ sửa một bên.
 *
 *   3. Chữ ký hàm khớp ĐÚNG trang admin đang mount. Trang này không nhận props
 *      nên wrapper cũng không — đừng bọc `props: any` rồi spread cho "an toàn":
 *      trang nào có `searchParams` mà wrapper nuốt mất thì màn mở ra luôn ở
 *      trang 1 không lọc gì, và không có lỗi nào nổ ra để biết.
 */
import AdminOrdersPage from "@/app/(admin)/admin/orders/page";
import { chanNeuThieuQuyen } from "@/lib/sale/cong-trang";

export const dynamic = "force-dynamic";
export const metadata = { title: "Đơn hàng | Tư vấn tuyển sinh" };

export default async function SaleOrdersPage() {
  const chan = await chanNeuThieuQuyen("/sale/don-hang", "Đơn hàng");
  if (chan) return chan;
  return <AdminOrdersPage />;
}
