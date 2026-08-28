/**
 * Site Sale — MOUNT LẠI màn "Hoa hồng" của khu quản trị (`/admin/crm/commission`).
 *
 * Bản admin không nhận props nào, nên wrapper cũng không nhận.
 *
 * Cổng của site Sale chạy TRƯỚC là bắt buộc ở màn này hơn ở đâu hết: đường từ
 * chối của bản admin là `redirect("/admin/dashboard")` — đường đó chỉ có nghĩa
 * trên tên miền quản trị, còn ở host Sale là 404 trắng.
 */
import AdminCommissionPage from "@/app/(admin)/admin/crm/commission/page";
import { chanNeuThieuQuyen } from "@/lib/sale/cong-trang";

export const dynamic = "force-dynamic";
export const metadata = { title: "Hoa hồng | Tư vấn tuyển sinh" };

export default async function SaleCommissionPage() {
  const chan = await chanNeuThieuQuyen("/sale/hoa-hong", "Hoa hồng");
  if (chan) return chan;
  return <AdminCommissionPage />;
}
