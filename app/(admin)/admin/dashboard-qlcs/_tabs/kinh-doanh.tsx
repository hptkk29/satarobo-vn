import { ChoDuLieu } from "../_components/cho-du-lieu";

/**
 * Tab Kinh doanh — khu vực C (C-02 khối chỉ số lead · C-03 bảng lead đã chuyển đổi ·
 * C-04 xuất Excel · C-05 bảng lead rớt).
 */
export function TabKinhDoanh() {
  return (
    <ChoDuLieu
      maSpec="C-02 → C-05"
      tieuDe="Kinh doanh: chưa nối số liệu lead vào màn"
      giaiThich={
        "Nền dữ liệu của khu vực C đã dựng xong ở đợt trước (chỉ tiêu, trạng thái rớt " +
        "theo từng con, vết đổi trạng thái), nhưng chưa có hàm nào gom chúng thành khối " +
        "chỉ số và hai bảng cho khoảng ngày đang lọc."
      }
      daCo={[
        "Chỉ tiêu lead theo tháng × cơ sở (C-01) — bảng LeadTarget + màn /bao-cao/muc-tieu-lead",
        "Trạng thái rớt theo TỪNG CON + lý do ở cấp phụ huynh (C-06) — LeadChild.status, Lead.lostNote/lostAt",
        "Vết đổi trạng thái, một đường ghi duy nhất (C-07) — lib/lead/status-trail.ts",
      ]}
      chuaCo={[
        "C-02 tổng lead · tỷ lệ đạt chỉ tiêu · tỷ lệ chốt, theo khoảng ngày đang lọc",
        "C-03 bảng lead đã chuyển đổi (giá trị, % trên tổng doanh thu, thời gian chốt)",
        "C-05 bảng lead rớt kèm số ngày chưa tiếp cận lại",
        "C-04 xuất Excel bảng C-03 (áp quyền xuất lead của A-03)",
      ]}
    />
  );
}
