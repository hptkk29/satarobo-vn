// A-02 — khung tab "Tài chính" (khu vực B). PLACEHOLDER: chưa đọc dữ liệu nào.
//
// Nhận `filters` do page cha giải MỘT LẦN bằng `resolveScopeFilters()` — cả 4 tab dùng
// CHUNG một bộ lọc (A-02-3). Tab KHÔNG tự đọc searchParams: hai bộ parse lệch nhau là
// hỏng câm. Mọi hàm số liệu nối vào đây phải nhận `groupByCenter` NGAY TỪ BẢN ĐẦU
// (§6.2 bẫy 4) — viết cứng dạng gộp rồi "thêm tách sau" là viết lại cả tầng truy vấn.
//
// ⚠️ A-02-7 / L-A9 trước khi nối số liệu: `RevenueTarget` KHÔNG nằm trong
// `SCOPED_MODELS` ⇒ tab này CHƯA được bật "Tất cả cơ sở" cho tới khi có đường lọc
// tay + test cách ly. Ngoài ra `RevenueTarget` có `@@unique([centerId, period])` và
// Postgres coi NULL là DISTINCT: đổi sang `{ in: [...] }` sẽ LOẠI MẤT dòng mục tiêu
// toàn công ty (`centerId = null`) — xem A-nen-tang.md §9.

import type { ScopeFilters } from "@/lib/reports/filters";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function TabTaiChinh({ filters }: { filters: ScopeFilters }) {
  void filters; // seam: sprint sau đọc `centerIds` / `dateFrom` / `dateTo` / `groupByCenter` từ đây.
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Tài chính</CardTitle>
        <CardDescription>Doanh thu, công nợ, mục tiêu doanh thu theo phạm vi đang chọn.</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="rounded-md border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
          Chưa có dữ liệu — sẽ dựng ở sprint sau.
        </p>
      </CardContent>
    </Card>
  );
}
