/**
 * Site Sale — MOUNT LẠI màn "CRM" (bảng điều khiển phễu lead) của khu quản trị.
 * Khuôn: `app/(sale)/sale/don-hang/page.tsx`.
 *
 * Bản admin thiếu quyền thì `redirect("/dashboard")` — 404 trên host Sale. Cổng
 * dưới đây chặn trước nên đường đó không bao giờ tới lượt chạy.
 * Trang admin không nhận props ⇒ lớp bọc cũng không nhận.
 */
import AdminCrmPage from "@/app/(admin)/admin/crm/page";
import { chanNeuThieuQuyen } from "@/lib/sale/cong-trang";

export const dynamic = "force-dynamic";
export const metadata = { title: "CRM | Tư vấn tuyển sinh" };

export default async function SaleCrmPage() {
  const chan = await chanNeuThieuQuyen("/sale/crm", "CRM");
  if (chan) return chan;
  return <AdminCrmPage />;
}
