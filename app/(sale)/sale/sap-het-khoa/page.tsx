/**
 * Site Sale — MOUNT LẠI màn "Sắp hết khoá" của khu quản trị.
 * Khuôn mẫu + lý do từng bước: `app/(sale)/sale/don-hang/page.tsx`.
 *
 * Trang admin KHÔNG nhận props nên lớp bọc cũng không nhận.
 */
import AdminNearingEndPage from "@/app/(admin)/admin/students/sap-het-khoa/page";
import { chanNeuThieuQuyen } from "@/lib/sale/cong-trang";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sắp hết khoá | Tư vấn tuyển sinh" };

export default async function SaleNearingEndPage() {
  const chan = await chanNeuThieuQuyen("/sale/sap-het-khoa", "Sắp hết khoá");
  if (chan) return chan;
  return <AdminNearingEndPage />;
}
