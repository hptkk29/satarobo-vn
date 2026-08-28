/**
 * Site Sale — MOUNT LẠI màn "Chốt hàng loạt" (`/admin/leads/bulk-convert`).
 * Khuôn: `app/(sale)/sale/don-hang/page.tsx`.
 *
 * Bản admin thiếu quyền thì `redirect("/leads")` — trên host Sale đường đó là
 * 404 (màn Leads ở đây nằm tại `/sale/leads`). Cổng dưới đây chặn trước.
 * Trang admin không nhận props ⇒ lớp bọc cũng không nhận.
 */
import AdminBulkConvertPage from "@/app/(admin)/admin/leads/bulk-convert/page";
import { chanNeuThieuQuyen } from "@/lib/sale/cong-trang";

export const dynamic = "force-dynamic";
export const metadata = { title: "Chốt hàng loạt | Tư vấn tuyển sinh" };

export default async function SaleChotHangLoatPage() {
  const chan = await chanNeuThieuQuyen("/sale/chot-hang-loat", "Chốt hàng loạt");
  if (chan) return chan;
  return <AdminBulkConvertPage />;
}
