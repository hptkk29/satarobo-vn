/**
 * Site Sale — MOUNT LẠI màn "Học bạ" của khu quản trị.
 * Khuôn mẫu + lý do từng bước: `app/(sale)/sale/don-hang/page.tsx`.
 *
 * Trang admin nhận `searchParams` (studentId) — chọn học viên cần xem học bạ.
 *
 * ⚠️ LỊCH SỬ, ĐỪNG "SỬA": Ban giám đốc chốt 10/07/2026 rằng Sale KHÔNG xem học
 *    bạ. Chủ dự án 28/08/2026 yêu cầu đưa mục này về site Sale, nên ĐƯỜNG có mặt
 *    còn CỔNG giữ nguyên hai action của quyết định cũ (`curriculum:view` +
 *    `students:view-own-class` — xem chú thích `/hoc-ba` trong
 *    `lib/auth/page-gates.ts`). Sale vào được chỉ khi quản trị viên cấp quyền
 *    trong giao diện, tức một lần đảo quyết định CÓ DẤU VẾT. Nới cổng ở đây là
 *    lặng lẽ lật quyết định của BGĐ.
 */
import AdminTranscriptPage from "@/app/(admin)/admin/hoc-ba/page";
import { chanNeuThieuQuyen } from "@/lib/sale/cong-trang";

export const dynamic = "force-dynamic";
export const metadata = { title: "Học bạ | Tư vấn tuyển sinh" };

type Props = Parameters<typeof AdminTranscriptPage>[0];

export default async function SaleTranscriptPage({ searchParams }: Props) {
  const chan = await chanNeuThieuQuyen("/sale/hoc-ba", "Học bạ");
  if (chan) return chan;
  return <AdminTranscriptPage searchParams={searchParams} />;
}
