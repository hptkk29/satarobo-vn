/**
 * Site Sale — MOUNT LẠI màn "Tổng hợp công ca" của khu quản trị
 * (`/admin/cham-cong/lich-ca-nhan-vien`). Tên đường ở site Sale ngắn hơn theo
 * đúng bảng `PAGE_GATES`, nhưng vẫn là MỘT trang, không phải bản sao.
 *
 * Chữ ký khớp đúng bản admin: `date` (mỏ neo tuần đang xem) và `centerId` (bộ
 * lọc cơ sở, chỉ có tác dụng với người xem được nhiều cơ sở). Nuốt mất thì
 * chuyển tuần và lọc cơ sở đều thành nút chết.
 */
import AdminManagerShiftsPage from "@/app/(admin)/admin/cham-cong/lich-ca-nhan-vien/page";
import { chanNeuThieuQuyen } from "@/lib/sale/cong-trang";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tổng hợp công ca | Tư vấn tuyển sinh" };

export default async function SaleManagerShiftsPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; centerId?: string }>;
}) {
  const chan = await chanNeuThieuQuyen("/sale/cham-cong/tong-hop", "Tổng hợp công ca");
  if (chan) return chan;
  return <AdminManagerShiftsPage searchParams={searchParams} />;
}
