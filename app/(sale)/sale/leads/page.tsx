/**
 * Site Sale — MOUNT LẠI màn "Leads" của khu quản trị.
 * Khuôn: `app/(sale)/sale/don-hang/page.tsx`.
 *
 * Trang admin NHẬN `searchParams` và đọc rất nhiều khoá từ đó (`page`, `size`,
 * `status`, `q`, `view`, `centerId`, `assignedToId`, `source`, `dateFrom`,
 * `dateTo`). Lớp bọc phải chuyển tiếp nguyên vẹn — nuốt mất thì bảng luôn mở ở
 * trang 1, chế độ bảng, không lọc gì, mà KHÔNG có lỗi nào nổ ra để biết.
 * Kiểu `SP` không được bản admin export nên lấy qua `Parameters<typeof …>[0]`:
 * admin thêm/bớt ô lọc thì lớp bọc theo kịp, không phải chép tay lần hai.
 */
import AdminLeadsPage from "@/app/(admin)/admin/leads/page";
import { chanNeuThieuQuyen } from "@/lib/sale/cong-trang";

export const dynamic = "force-dynamic";
export const metadata = { title: "Leads | Tư vấn tuyển sinh" };

export default async function SaleLeadsPage(
  props: Parameters<typeof AdminLeadsPage>[0],
) {
  const chan = await chanNeuThieuQuyen("/sale/leads", "Leads");
  if (chan) return chan;
  return <AdminLeadsPage searchParams={props.searchParams} />;
}
