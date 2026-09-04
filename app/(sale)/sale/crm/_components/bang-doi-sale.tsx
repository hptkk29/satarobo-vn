/**
 * Site Sale — bảng "Hiệu suất đội sale" của màn CRM.
 *
 * ── BẢN ĐÔI CỦA khối `<table>` cuối `app/(admin)/admin/crm/page.tsx` ────────
 * Quyết định 04/09/2026: màn Sale tách bản riêng để thiết kế lại mà không đụng
 * một pixel nào của khu quản trị.
 *
 * GIỮ NGUYÊN 100%: bốn cột đúng thứ tự và đúng nhãn — Nhân viên · Lead được giao ·
 * Đã chốt · Tỉ lệ chốt; xếp theo số đã chốt giảm dần; và câu rỗng
 * "Chưa có nhân viên SALES_CSM."
 *
 * ── ĐỔI CÁCH BÀY ────────────────────────────────────────────────────────────
 * Class gõ từng ô (`py-2 pr-4 …`) → `.bang-sale` của `sale.css`: mật độ nằm ở CSS
 * thì bảng MỚI tự đúng. Ba cột số dùng `o-so` (canh phải + chữ số đều bề ngang) —
 * bản admin để cả ba canh trái nên quét dọc không so được số nào với số nào.
 *
 * ⚠️ KHÔNG tô màu tỉ lệ chốt. Cám dỗ ở đây rất rõ: xanh cho người cao, đỏ cho
 *    người thấp. Nhưng không có ngưỡng nào được ai chốt, và tô màu hiệu suất từng
 *    người là một quyết định QUẢN LÝ chứ không phải một quyết định giao diện. Thứ
 *    tự sắp xếp đã nói ai đang dẫn đầu.
 */
import { PhanTrangBang } from "@/components/ui/phan-trang-bang";
import { KhungDuLieu } from "@/components/sale/ui/khung-du-lieu";
import type { SoLieuCrm } from "@/lib/sale/crm";

export function BangDoiSale({ dong }: { dong: SoLieuCrm["doiSale"] }) {
  if (dong.length === 0) {
    return <KhungDuLieu.Rong ten="Chưa có nhân viên SALES_CSM." />;
  }

  return (
    <PhanTrangBang tenDonVi="nhân viên" khoaGhiNho="sale-crm-doi-sale" cuonNgang>
      <table className="bang-sale">
        <thead>
          <tr>
            <th scope="col">Nhân viên</th>
            <th scope="col" className="o-so">
              Lead được giao
            </th>
            <th scope="col" className="o-so">
              Đã chốt
            </th>
            <th scope="col" className="o-so">
              Tỉ lệ chốt
            </th>
          </tr>
        </thead>
        <tbody>
          {dong.map((r) => (
            <tr key={r.id}>
              <td className="font-medium text-foreground">{r.ten}</td>
              <td className="o-so text-foreground">{r.duocGiao}</td>
              <td className="o-so text-foreground">{r.daChot}</td>
              <td className="o-so text-foreground">{r.tiLe.toFixed(1)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </PhanTrangBang>
  );
}
