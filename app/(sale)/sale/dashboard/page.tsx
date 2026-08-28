/**
 * Site Sale — MOUNT LẠI màn "Dashboard" của khu quản trị.
 * Khuôn: `app/(sale)/sale/don-hang/page.tsx`.
 *
 * Trang admin NHẬN `searchParams` (bộ lọc phạm vi của khối QLCS: cơ sở / khoảng
 * ngày) nên lớp bọc phải nhận và chuyển tiếp NGUYÊN VẸN. Nuốt mất là màn mở ra
 * luôn ở phạm vi mặc định, không lọc gì, và không lỗi nào nổ ra để biết.
 * `Parameters<typeof …>[0]` lấy đúng kiểu của bản admin nên hai bên không trôi lệch.
 */
import AdminDashboardPage from "@/app/(admin)/admin/dashboard/page";
import { chanNeuThieuQuyen } from "@/lib/sale/cong-trang";

export const dynamic = "force-dynamic";
export const metadata = { title: "Dashboard | Tư vấn tuyển sinh" };

export default async function SaleDashboardPage(
  props: Parameters<typeof AdminDashboardPage>[0],
) {
  const chan = await chanNeuThieuQuyen("/sale/dashboard", "Dashboard");
  if (chan) return chan;
  return <AdminDashboardPage searchParams={props.searchParams} />;
}
