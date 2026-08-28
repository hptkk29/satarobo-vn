/**
 * Site Sale — MOUNT LẠI màn "Chuyển lớp / cơ sở" của khu quản trị.
 * Khuôn mẫu + lý do từng bước: `app/(sale)/sale/don-hang/page.tsx`.
 *
 * Trang admin nhận `searchParams` (fromCenterId) — chọn cơ sở nguồn.
 */
import AdminTransferPage from "@/app/(admin)/admin/chuyen-lop/page";
import { chanNeuThieuQuyen } from "@/lib/sale/cong-trang";

export const dynamic = "force-dynamic";
export const metadata = { title: "Chuyển lớp / cơ sở | Tư vấn tuyển sinh" };

type Props = Parameters<typeof AdminTransferPage>[0];

export default async function SaleTransferPage({ searchParams }: Props) {
  const chan = await chanNeuThieuQuyen("/sale/chuyen-lop", "Chuyển lớp / cơ sở");
  if (chan) return chan;
  return <AdminTransferPage searchParams={searchParams} />;
}
