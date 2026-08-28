/**
 * Site Sale — MOUNT LẠI màn "Học viên" của khu quản trị.
 * Khuôn mẫu + lý do từng bước: `app/(sale)/sale/don-hang/page.tsx`.
 *
 * Trang admin nhận `searchParams` (q / status / centerId / grade / page / view /
 * size). Kiểu lấy thẳng từ chữ ký trang admin nên không thể trôi lệch, và prop
 * được chuyển tiếp TƯỜNG MINH — nuốt mất nó thì màn mở ra luôn ở trang 1 không
 * lọc gì mà chẳng có lỗi nào nổ ra.
 */
import AdminStudentsPage from "@/app/(admin)/admin/students/page";
import { chanNeuThieuQuyen } from "@/lib/sale/cong-trang";

export const dynamic = "force-dynamic";
export const metadata = { title: "Học viên | Tư vấn tuyển sinh" };

type Props = Parameters<typeof AdminStudentsPage>[0];

export default async function SaleStudentsPage({ searchParams }: Props) {
  const chan = await chanNeuThieuQuyen("/sale/hoc-vien", "Học viên");
  if (chan) return chan;
  return <AdminStudentsPage searchParams={searchParams} />;
}
