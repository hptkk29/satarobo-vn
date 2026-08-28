/**
 * Site Sale — MOUNT LẠI màn "Ảnh lớp học" của khu quản trị.
 * Khuôn mẫu + lý do từng bước: `app/(sale)/sale/don-hang/page.tsx`.
 *
 * Trang admin KHÔNG nhận props nên lớp bọc cũng không nhận.
 */
import AdminMediaPage from "@/app/(admin)/admin/media/page";
import { chanNeuThieuQuyen } from "@/lib/sale/cong-trang";

export const dynamic = "force-dynamic";
export const metadata = { title: "Ảnh lớp học | Tư vấn tuyển sinh" };

export default async function SaleMediaPage() {
  const chan = await chanNeuThieuQuyen("/sale/anh-lop-hoc", "Ảnh lớp học");
  if (chan) return chan;
  return <AdminMediaPage />;
}
