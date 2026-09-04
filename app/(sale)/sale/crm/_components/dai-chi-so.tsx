/**
 * Site Sale — DẢI BỐN CHỈ SỐ đầu màn CRM.
 *
 * ── BẢN ĐÔI CỦA khối `<StatCardAdmin>` ×4 trong `app/(admin)/admin/crm/page.tsx` ──
 * Quyết định 04/09/2026: màn Sale tách bản riêng để thiết kế lại mà không đụng
 * một pixel nào của khu quản trị.
 *
 * GIỮ NGUYÊN 100%: đúng bốn ô, đúng thứ tự, đúng nhãn — "Lead tháng này" ·
 * "Đang xử lý" · "Chốt tháng này" · "Tỉ lệ chuyển đổi" — và đúng bốn biểu tượng.
 *
 * ── VÌ SAO KHÔNG DÙNG `components/sale/ui/dai-so-lieu.tsx` ──────────────────
 * `DaiSoLieu` (dải số của màn "Bảng việc hôm nay") khai `soLuong: number`, mà ô
 * "Tỉ lệ chuyển đổi" là một CHUỖI có dấu `%`. Nới kiểu của nó thành
 * `number | string` là sửa một thành phần đang chạy ở màn khác, ngoài phạm vi
 * đợt tách hai màn này — nên dải ở đây là bản riêng của màn CRM.
 * ⚠️ Nếu sau này có màn thứ ba cần dải chỉ số dạng chuỗi, việc ĐÚNG là nới
 *    `DaiSoLieu` rồi xoá tệp này, chứ không phải chép thành bản thứ ba.
 *
 * ── ĐỔI CÁCH BÀY ────────────────────────────────────────────────────────────
 * Bốn THẺ RỜI → MỘT dải liền chia ô bằng đường kẻ, cùng ngôn ngữ với `DaiSoLieu`.
 * Bốn thẻ rời nổi trên nền trang bắt mắt quyết định bốn lần "đây có phải một khối
 * không". Số dùng `text-xl` chứ không `text-4xl` — cỡ chữ khổng lồ chính là thứ
 * đã làm `955.563.000đ` tràn thẻ ở khu quản trị.
 *
 * ⚠️ KHÔNG tô màu ô nào. Bốn con số này là ẢNH CHỤP TÌNH HÌNH, không phải việc
 *    cần làm: không có ngưỡng nào để nói "đỏ" hay "vàng", và tô đại một cái là
 *    dạy người dùng bỏ qua màu ở chỗ màu thật sự có nghĩa.
 */
import type { ReactNode } from "react";
import { CheckCircle2, Loader2, Percent, Users } from "lucide-react";
import { cn } from "@/lib/utils";

type ChiSo = { nhan: string; gia: string; bieuTuong: ReactNode };

export function DaiChiSoCrm({
  leadThangNay,
  dangXuLy,
  chotThangNay,
  tiLeChuyenDoi,
}: {
  leadThangNay: number;
  dangXuLy: number;
  chotThangNay: number;
  /** Phần trăm chưa làm tròn — làm tròn 1 chữ số ngay tại đây, như bản admin. */
  tiLeChuyenDoi: number;
}) {
  const o: ChiSo[] = [
    {
      nhan: "Lead tháng này",
      gia: leadThangNay.toLocaleString("vi-VN"),
      bieuTuong: <Users aria-hidden="true" className="size-4" />,
    },
    {
      nhan: "Đang xử lý",
      gia: dangXuLy.toLocaleString("vi-VN"),
      bieuTuong: <Loader2 aria-hidden="true" className="size-4" />,
    },
    {
      nhan: "Chốt tháng này",
      gia: chotThangNay.toLocaleString("vi-VN"),
      bieuTuong: <CheckCircle2 aria-hidden="true" className="size-4" />,
    },
    {
      nhan: "Tỉ lệ chuyển đổi",
      gia: `${tiLeChuyenDoi.toFixed(1)}%`,
      bieuTuong: <Percent aria-hidden="true" className="size-4" />,
    },
  ];

  return (
    <div
      className={cn(
        "grid grid-cols-2 overflow-hidden border-b border-border sm:grid-cols-4",
        // Đường kẻ chia ô vẽ bằng viền của chính ô, không bằng `divide-*`:
        // `divide` không xử lý được lúc xuống 2 cột trên màn hẹp.
        "[&>*]:border-border [&>*]:border-b [&>*]:border-r",
        "[&>*:nth-child(2n)]:border-r-0 sm:[&>*:nth-child(2n)]:border-r",
        "sm:[&>*]:border-b-0 [&>*:nth-last-child(-n+2)]:border-b-0",
        "sm:[&>*:last-child]:border-r-0",
      )}
    >
      {o.map((x) => (
        <div key={x.nhan} className="flex flex-col px-5 py-4">
          <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            {x.bieuTuong}
            {x.nhan}
          </span>
          <span className="mt-1 text-xl font-semibold leading-none tabular-nums text-foreground">
            {x.gia}
          </span>
        </div>
      ))}
    </div>
  );
}
