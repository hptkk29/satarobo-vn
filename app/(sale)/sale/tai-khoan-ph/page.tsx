/**
 * Site Sale — MOUNT LẠI màn "Tài khoản phụ huynh" của khu quản trị.
 * Khuôn mẫu + lý do từng bước: `app/(sale)/sale/don-hang/page.tsx`.
 *
 * Trang admin nhận `searchParams` (status) — lọc theo trạng thái tài khoản.
 */
import AdminParentAccountsPage from "@/app/(admin)/admin/students/tai-khoan/page";
import { chanNeuThieuQuyen } from "@/lib/sale/cong-trang";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tài khoản phụ huynh | Tư vấn tuyển sinh" };

type Props = Parameters<typeof AdminParentAccountsPage>[0];

export default async function SaleParentAccountsPage({ searchParams }: Props) {
  const chan = await chanNeuThieuQuyen("/sale/tai-khoan-ph", "Tài khoản phụ huynh");
  if (chan) return chan;
  return <AdminParentAccountsPage searchParams={searchParams} />;
}
