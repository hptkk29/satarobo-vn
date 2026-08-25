// A-02 — khung tab "Chi phí Marketing" (khu vực D). PLACEHOLDER: chưa đọc dữ liệu nào.
//
// Nhận `filters` do page cha giải MỘT LẦN bằng `resolveScopeFilters()` — cả 4 tab dùng
// CHUNG một bộ lọc (A-02-3). Tab KHÔNG tự đọc searchParams: hai bộ parse lệch nhau là
// hỏng câm. Mọi hàm số liệu nối vào đây phải nhận `groupByCenter` NGAY TỪ BẢN ĐẦU
// (§6.2 bẫy 4) — viết cứng dạng gộp rồi "thêm tách sau" là viết lại cả tầng truy vấn.
//
// ⚠️ A-02-7 / L-A9 — CHẶN CỨNG trước khi nối số liệu: `AdsInsightDaily` và
// `MarketingCostPeriod` KHÔNG nằm trong `SCOPED_MODELS` ⇒ `injectScope` thoát ngay
// (`lib/db-scope.ts:269`) và `centerIds = null` KHÔNG tự an toàn. Tab này CHƯA được
// bật "Tất cả cơ sở" cho tới khi model được cách ly hoặc có đường lọc tay + test
// cách ly xanh — cổng C6 của sprint-plan.

import type { ScopeFilters } from "@/lib/reports/filters";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function TabChiPhiMarketing({ filters }: { filters: ScopeFilters }) {
  void filters; // seam: sprint sau đọc `centerIds` / `dateFrom` / `dateTo` / `groupByCenter` từ đây.
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Chi phí Marketing</CardTitle>
        <CardDescription>Chi phí quảng cáo, CPL, ROAS theo phạm vi đang chọn.</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="rounded-md border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
          Chưa có dữ liệu — sẽ dựng ở sprint sau.
        </p>
      </CardContent>
    </Card>
  );
}
