/**
 * Site Sale — MOUNT LẠI màn "Đăng ký học" của khu quản trị.
 * Khuôn mẫu + lý do từng bước: `app/(sale)/sale/don-hang/page.tsx`.
 *
 * Trang admin nhận `searchParams` (q / status / classId / centerId).
 */
import AdminEnrollmentsPage from "@/app/(admin)/admin/enrollments/page";
import { chanNeuThieuQuyen } from "@/lib/sale/cong-trang";

export const dynamic = "force-dynamic";
export const metadata = { title: "Đăng ký học | Tư vấn tuyển sinh" };

type Props = Parameters<typeof AdminEnrollmentsPage>[0];

export default async function SaleEnrollmentsPage({ searchParams }: Props) {
  const chan = await chanNeuThieuQuyen("/sale/dang-ky-hoc", "Đăng ký học");
  if (chan) return chan;
  return <AdminEnrollmentsPage searchParams={searchParams} />;
}
