/**
 * Site Sale — MOUNT LẠI màn "Yêu cầu chỉnh công" của khu quản trị.
 *
 * Bản admin không nhận props nào (chỉ liệt kê yêu cầu của chính người đăng
 * nhập), nên wrapper cũng không nhận.
 */
import AdminYeuCauCongPage from "@/app/(admin)/admin/cham-cong/yeu-cau-cong/page";
import { chanNeuThieuQuyen } from "@/lib/sale/cong-trang";

export const dynamic = "force-dynamic";
export const metadata = { title: "Yêu cầu chỉnh công | Tư vấn tuyển sinh" };

export default async function SaleYeuCauCongPage() {
  const chan = await chanNeuThieuQuyen("/sale/cham-cong/yeu-cau-cong", "Yêu cầu chỉnh công");
  if (chan) return chan;
  return <AdminYeuCauCongPage />;
}
