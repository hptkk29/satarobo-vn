/**
 * Site Sale — MOUNT LẠI màn "Điểm danh vào ca" của khu quản trị.
 *
 * Chữ ký khớp đúng bản admin: `c` (mã cơ sở) và `t` (token trên mã QR). Đây là
 * hai thứ DUY NHẤT làm màn này chạy được — nuốt mất thì người quét QR nào cũng
 * chỉ thấy câu "Mã QR không hợp lệ", và không lỗi nào nổ để biết vì sao.
 */
import AdminCheckinPage from "@/app/(admin)/admin/cham-cong/checkin/page";
import { chanNeuThieuQuyen } from "@/lib/sale/cong-trang";

export const dynamic = "force-dynamic";
export const metadata = { title: "Điểm danh vào ca | Tư vấn tuyển sinh" };

export default async function SaleCheckinPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string; t?: string }>;
}) {
  const chan = await chanNeuThieuQuyen("/sale/cham-cong/checkin", "Điểm danh vào ca");
  if (chan) return chan;
  return <AdminCheckinPage searchParams={searchParams} />;
}
