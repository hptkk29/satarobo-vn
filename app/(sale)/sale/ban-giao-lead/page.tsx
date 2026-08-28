/**
 * Site Sale — MOUNT LẠI màn "Bàn giao lead" của khu quản trị.
 * Khuôn: `app/(sale)/sale/don-hang/page.tsx`.
 *
 * Bản admin thiếu quyền thì `redirect("/dashboard")` — 404 trên host Sale. Cổng
 * dưới đây chặn trước.
 * Trang admin không nhận props ⇒ lớp bọc cũng không nhận.
 */
import AdminHandoverPage from "@/app/(admin)/admin/ban-giao-lead/page";
import { chanNeuThieuQuyen } from "@/lib/sale/cong-trang";

export const dynamic = "force-dynamic";
export const metadata = { title: "Bàn giao lead | Tư vấn tuyển sinh" };

export default async function SaleBanGiaoLeadPage() {
  const chan = await chanNeuThieuQuyen("/sale/ban-giao-lead", "Bàn giao lead");
  if (chan) return chan;
  return <AdminHandoverPage />;
}
