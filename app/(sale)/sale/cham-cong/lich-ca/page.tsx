/**
 * Site Sale — MOUNT LẠI màn "Lịch ca của tôi" của khu quản trị.
 *
 * Chữ ký khớp đúng bản admin: `month` dạng `YYYY-MM`. Nuốt mất là hai nút lùi /
 * tiến tháng bấm không nhúc nhích, luôn hiện tháng hiện tại.
 */
import AdminMyShiftsPage from "@/app/(admin)/admin/cham-cong/lich-ca/page";
import { chanNeuThieuQuyen } from "@/lib/sale/cong-trang";

export const dynamic = "force-dynamic";
export const metadata = { title: "Lịch ca của tôi | Tư vấn tuyển sinh" };

export default async function SaleMyShiftsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const chan = await chanNeuThieuQuyen("/sale/cham-cong/lich-ca", "Lịch ca của tôi");
  if (chan) return chan;
  return <AdminMyShiftsPage searchParams={searchParams} />;
}
