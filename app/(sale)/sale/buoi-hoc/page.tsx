/**
 * Site Sale — MOUNT LẠI màn "Buổi học" của khu quản trị.
 * Khuôn mẫu + lý do từng bước: `app/(sale)/sale/don-hang/page.tsx`.
 *
 * Trang admin nhận `searchParams` (scope / classId).
 */
import AdminSessionsPage from "@/app/(admin)/admin/sessions/page";
import { chanNeuThieuQuyen } from "@/lib/sale/cong-trang";

export const dynamic = "force-dynamic";
export const metadata = { title: "Buổi học | Tư vấn tuyển sinh" };

type Props = Parameters<typeof AdminSessionsPage>[0];

export default async function SaleSessionsPage({ searchParams }: Props) {
  const chan = await chanNeuThieuQuyen("/sale/buoi-hoc", "Buổi học");
  if (chan) return chan;
  return <AdminSessionsPage searchParams={searchParams} />;
}
