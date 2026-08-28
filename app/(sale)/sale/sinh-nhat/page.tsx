/**
 * Site Sale — MOUNT LẠI màn "Sinh nhật học viên" của khu quản trị.
 * Khuôn mẫu + lý do từng bước: `app/(sale)/sale/don-hang/page.tsx`.
 *
 * Trang admin KHÔNG nhận props nên lớp bọc cũng không nhận.
 */
import AdminBirthdayPage from "@/app/(admin)/admin/sinh-nhat/page";
import { chanNeuThieuQuyen } from "@/lib/sale/cong-trang";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sinh nhật học viên | Tư vấn tuyển sinh" };

export default async function SaleBirthdayPage() {
  const chan = await chanNeuThieuQuyen("/sale/sinh-nhat", "Sinh nhật học viên");
  if (chan) return chan;
  return <AdminBirthdayPage />;
}
