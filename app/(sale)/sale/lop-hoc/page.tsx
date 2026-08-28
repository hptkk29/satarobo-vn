/**
 * Site Sale — MOUNT LẠI màn "Lớp học" của khu quản trị.
 * Khuôn mẫu + lý do từng bước: `app/(sale)/sale/don-hang/page.tsx`.
 *
 * Trang admin nhận `searchParams` (q / status / centerId / courseId / teacherId).
 */
import AdminClassesPage from "@/app/(admin)/admin/classes/page";
import { chanNeuThieuQuyen } from "@/lib/sale/cong-trang";

export const dynamic = "force-dynamic";
export const metadata = { title: "Lớp học | Tư vấn tuyển sinh" };

type Props = Parameters<typeof AdminClassesPage>[0];

export default async function SaleClassesPage({ searchParams }: Props) {
  const chan = await chanNeuThieuQuyen("/sale/lop-hoc", "Lớp học");
  if (chan) return chan;
  return <AdminClassesPage searchParams={searchParams} />;
}
