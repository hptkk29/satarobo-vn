/**
 * Site Sale — MOUNT LẠI màn "Yêu cầu phụ huynh" của khu quản trị.
 *
 * Chữ ký khớp đúng bản admin: hai bộ lọc `type` (loại yêu cầu) và `status`
 * (trạng thái) nằm trong địa chỉ. Bỏ qua chúng thì màn luôn mở ở "Tất cả" và
 * mọi thẻ lọc bấm vào đều không đổi gì.
 */
import AdminParentRequestsPage from "@/app/(admin)/admin/parent-requests/page";
import { chanNeuThieuQuyen } from "@/lib/sale/cong-trang";

export const dynamic = "force-dynamic";
export const metadata = { title: "Yêu cầu phụ huynh | Tư vấn tuyển sinh" };

export default async function SaleParentRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; status?: string }>;
}) {
  const chan = await chanNeuThieuQuyen("/sale/yeu-cau-ph", "Yêu cầu phụ huynh");
  if (chan) return chan;
  return <AdminParentRequestsPage searchParams={searchParams} />;
}
