import { ChoDuLieu } from "../_components/cho-du-lieu";

/**
 * Tab Tài chính — khu vực B (B-02 hàng chỉ số 1 · B-03 hàng chỉ số 2 · B-04 doanh thu
 * theo ngày · B-05 import chi phí).
 *
 * Khung A-02-UI chỉ giao chỗ đứng + bộ lọc. Nội dung là việc kế tiếp; hàm số liệu sẽ
 * nhận `ScopeFilters` (đã có `centerIds` + khoảng ngày + `groupByCenter`) chứ không tự
 * đọc searchParams.
 */
export function TabTaiChinh() {
  return (
    <ChoDuLieu
      maSpec="B-02 → B-05"
      tieuDe="Tài chính: chưa nối số liệu vào màn"
      giaiThich={
        "Vế THU đã có hàm tính sẵn trong repo nhưng chưa nối vào tab này. Vế CHI thì " +
        "chưa có gì cả — hệ thống hôm nay không có bảng chi phí vận hành, nên Lợi nhuận " +
        "và Dòng tiền chưa tính được từ dữ liệu thật. Cố ý không hiện thẻ số 0: một " +
        "hàng chỉ số toàn 0 trông y hệt kết quả đo thật."
      }
      daCo={[
        "Doanh thu thực thu (đã trừ hoàn tiền + bút toán điều chỉnh) — lib/finance/thuc-thu.ts",
        "Mục tiêu doanh thu tháng × cơ sở (B-01) — bảng RevenueTarget + màn /bao-cao/doanh-thu",
      ]}
      chuaCo={[
        "Bảng chi phí vận hành + 3 quyền costs:view / costs:manage / costs:approve",
        "B-04 doanh thu chi tiết theo từng ngày trong khoảng đang lọc",
        "B-05 mẫu import chi phí (định nghĩa cột + kiểm tra + báo dòng lỗi)",
        "Dạng TÁCH THEO CƠ SỞ của cả 3 con số (mỗi cơ sở một dòng + dòng Tổng)",
      ]}
    />
  );
}
