/**
 * Site Sale — MOUNT LẠI màn "Chuyển lead liên cơ sở"
 * (`/admin/leads/bao-cao-chuyen`). Khuôn: `app/(sale)/sale/don-hang/page.tsx`.
 *
 * Trang admin NHẬN `searchParams` — khoá `month` chọn tháng của báo cáo. Lớp bọc
 * nuốt mất thì màn luôn hiện tháng hiện tại, người dùng bấm đổi tháng mà bảng
 * đứng yên, và không có lỗi nào nổ ra để biết.
 * Bản admin thiếu quyền thì `redirect("/leads")` — 404 trên host Sale; cổng chặn trước.
 */
import AdminTransferReportPage from "@/app/(admin)/admin/leads/bao-cao-chuyen/page";
import { chanNeuThieuQuyen } from "@/lib/sale/cong-trang";

export const dynamic = "force-dynamic";
export const metadata = { title: "Chuyển lead liên cơ sở | Tư vấn tuyển sinh" };

export default async function SaleChuyenLeadLienCsPage(
  props: Parameters<typeof AdminTransferReportPage>[0],
) {
  const chan = await chanNeuThieuQuyen(
    "/sale/chuyen-lead-lien-cs",
    "Chuyển lead liên cơ sở",
  );
  if (chan) return chan;
  return <AdminTransferReportPage searchParams={props.searchParams} />;
}
