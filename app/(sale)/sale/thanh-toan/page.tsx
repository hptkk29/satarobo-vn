/**
 * Site Sale — MOUNT LẠI màn "Thanh toán" của khu quản trị.
 *
 * Bản admin không nhận props nào (bộ lọc nằm trong phần client, không qua địa
 * chỉ), nên wrapper cũng không nhận.
 */
import AdminPaymentsPage from "@/app/(admin)/admin/payments/page";
import { chanNeuThieuQuyen } from "@/lib/sale/cong-trang";

export const dynamic = "force-dynamic";
export const metadata = { title: "Thanh toán | Tư vấn tuyển sinh" };

export default async function SalePaymentsPage() {
  const chan = await chanNeuThieuQuyen("/sale/thanh-toan", "Thanh toán");
  if (chan) return chan;
  return <AdminPaymentsPage />;
}
