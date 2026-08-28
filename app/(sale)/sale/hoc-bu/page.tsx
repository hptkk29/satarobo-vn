/**
 * Site Sale — MOUNT LẠI màn "Học bù" của khu quản trị.
 * Khuôn mẫu + lý do từng bước: `app/(sale)/sale/don-hang/page.tsx`.
 *
 * Trang admin KHÔNG nhận props nên lớp bọc cũng không nhận.
 */
import AdminMakeupPage from "@/app/(admin)/admin/hoc-bu/page";
import { chanNeuThieuQuyen } from "@/lib/sale/cong-trang";

export const dynamic = "force-dynamic";
export const metadata = { title: "Học bù | Tư vấn tuyển sinh" };

export default async function SaleMakeupPage() {
  const chan = await chanNeuThieuQuyen("/sale/hoc-bu", "Học bù");
  if (chan) return chan;
  return <AdminMakeupPage />;
}
