/**
 * Site Sale — bảng "Hoa hồng theo kỳ".
 *
 * ── BẢN ĐÔI CỦA khối `<Table>` trong `app/(admin)/admin/crm/commission/page.tsx` ──
 * Quyết định 04/09/2026: màn Sale tách bản riêng để thiết kế lại mà không đụng
 * một pixel nào của khu quản trị. Bản admin giữ nguyên, không sửa.
 *
 * GIỮ NGUYÊN 100%: năm cột đúng thứ tự và đúng nhãn — Kỳ · Trạng thái · Số dòng ·
 * Tổng (VND) · Hành động; dòng rỗng "Chưa có bảng hoa hồng nào."; mã kỳ và mã
 * trạng thái in nguyên văn (không dịch — xem `lib/sale/trang-thai-hoa-hong.ts`).
 *
 * ── ĐỔI CÁCH BÀY ────────────────────────────────────────────────────────────
 * 1. `<Table>` shadcn → `.bang-sale` của `sale.css`.
 * 2. `<Badge variant=…>` → `<StatusPill tone>` theo thang ngữ nghĩa.
 * 3. Ba cột số (Số dòng · Tổng · Hành động) dùng `.o-so` → canh phải + chữ số đều
 *    bề ngang. Bản admin đã canh phải hai cột số nhưng KHÔNG bật `tabular-nums`,
 *    nên "1.234.000" và "955.563.000" lệch nhau từng chữ số khi dò dọc. Đây là
 *    bảng TIỀN: cột không thẳng hàng là cột không so được bằng mắt.
 *
 * ⚠️ KHÔNG có phép tính nào ở tệp này. `d.tong` và `d.soDong` tính xong ở
 *    `lib/sale/hoa-hong.ts` (đọc ghi chú đầu tệp đó trước khi đụng con số nào) —
 *    ở đây chỉ `toLocaleString("vi-VN")`, đúng như bản admin, KHÔNG thêm hậu tố
 *    "đ" vì đơn vị đã nằm trong tiêu đề cột "(VND)".
 *
 * Component MÁY CHỦ — không có state. Phần bấm được nằm trong `<HanhDongKy>`.
 */
import { StatusPill } from "@/components/admin/ui/status-pill";
import { KhungDuLieu } from "@/components/sale/ui/khung-du-lieu";
import { PhanTrangBang } from "@/components/ui/phan-trang-bang";
import type { DongKyHoaHong } from "@/lib/sale/hoa-hong";
import { toneKyHoaHong } from "@/lib/sale/trang-thai-hoa-hong";
import { HanhDongKy } from "./hanh-dong-ky";

export function BangKyHoaHong({
  dong,
  canChotKy,
}: {
  dong: DongKyHoaHong[];
  canChotKy: boolean;
}) {
  if (dong.length === 0) {
    return <KhungDuLieu.Rong ten="Chưa có bảng hoa hồng nào." />;
  }

  return (
    <PhanTrangBang tenDonVi="kỳ" khoaGhiNho="sale-hoa-hong" cuonNgang>
      <table className="bang-sale">
        <thead>
          <tr>
            <th scope="col">Kỳ</th>
            <th scope="col">Trạng thái</th>
            <th scope="col" className="o-so">
              Số dòng
            </th>
            <th scope="col" className="o-so">
              Tổng (VND)
            </th>
            <th scope="col" className="o-so">
              Hành động
            </th>
          </tr>
        </thead>
        <tbody>
          {dong.map((d) => (
            <tr key={d.ky}>
              <td className="font-mono font-semibold">{d.ky}</td>
              <td>
                <StatusPill tone={toneKyHoaHong(d.trangThai)}>{d.trangThai}</StatusPill>
              </td>
              <td className="o-so text-muted-foreground">{d.soDong}</td>
              <td className="o-so font-medium">{d.tong.toLocaleString("vi-VN")}</td>
              <td className="o-so">
                <HanhDongKy ky={d.ky} trangThai={d.trangThai} canChotKy={canChotKy} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </PhanTrangBang>
  );
}
