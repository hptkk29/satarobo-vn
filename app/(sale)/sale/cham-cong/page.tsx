/**
 * Site Sale — MOUNT LẠI màn "Chấm công" của khu quản trị.
 *
 * Chữ ký khớp đúng bản admin: `date` là ngày đang xem. Nuốt mất là ô chọn ngày
 * bấm xong quay về hôm nay, im lặng.
 *
 * ⚠️ Bản admin có nút "Mở màn hình QR" trỏ `/cham-cong/man-hinh`. Màn đó KHÔNG
 * nằm trong 11 màn được giao nên trên host Sale nó là 404 — không phải lỗi mount,
 * mà là màn chưa dựng.
 */
import AdminChamCongPage from "@/app/(admin)/admin/cham-cong/page";
import { chanNeuThieuQuyen } from "@/lib/sale/cong-trang";

export const dynamic = "force-dynamic";
export const metadata = { title: "Chấm công | Tư vấn tuyển sinh" };

export default async function SaleChamCongPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const chan = await chanNeuThieuQuyen("/sale/cham-cong", "Chấm công");
  if (chan) return chan;
  return <AdminChamCongPage searchParams={searchParams} />;
}
