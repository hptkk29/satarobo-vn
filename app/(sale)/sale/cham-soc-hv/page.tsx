/**
 * Site Sale — MOUNT LẠI màn "Chăm sóc học viên" của khu quản trị.
 *
 * Bản admin không nhận props nào (danh sách việc lọc theo chính người đăng nhập
 * và cơ sở của họ), nên wrapper cũng không nhận.
 */
import AdminCareTaskPage from "@/app/(admin)/admin/cham-soc-hv/page";
import { chanNeuThieuQuyen } from "@/lib/sale/cong-trang";

export const dynamic = "force-dynamic";
export const metadata = { title: "Chăm sóc học viên | Tư vấn tuyển sinh" };

export default async function SaleCareTaskPage() {
  const chan = await chanNeuThieuQuyen("/sale/cham-soc-hv", "Chăm sóc học viên");
  if (chan) return chan;
  return <AdminCareTaskPage />;
}
