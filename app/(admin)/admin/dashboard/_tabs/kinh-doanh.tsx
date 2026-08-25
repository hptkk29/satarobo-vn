// A-02 — khung tab "Kinh doanh" (khu vực C). PLACEHOLDER: chưa đọc dữ liệu nào.
//
// Nhận `filters` do page cha giải MỘT LẦN bằng `resolveScopeFilters()` — cả 4 tab dùng
// CHUNG một bộ lọc (A-02-3). Tab KHÔNG tự đọc searchParams: hai bộ parse lệch nhau là
// hỏng câm. Mọi hàm số liệu nối vào đây phải nhận `groupByCenter` NGAY TỪ BẢN ĐẦU
// (§6.2 bẫy 4) — viết cứng dạng gộp rồi "thêm tách sau" là viết lại cả tầng truy vấn.
//
// Ghi chú C.7 khi nối số liệu: chưa đặt mục tiêu ⇒ hiện "Chưa đặt mục tiêu",
// KHÔNG hiện `0%` (tiền lệ `computeAchievement` trả `null` —
// `lib/reports/revenue-target.ts:32-39`).

import type { ScopeFilters } from "@/lib/reports/filters";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function TabKinhDoanh({ filters }: { filters: ScopeFilters }) {
  void filters; // seam: sprint sau đọc `centerIds` / `dateFrom` / `dateTo` / `groupByCenter` từ đây.
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Kinh doanh</CardTitle>
        <CardDescription>Lead, tỷ lệ chốt, thời gian chốt theo phạm vi đang chọn.</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="rounded-md border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
          Chưa có dữ liệu — sẽ dựng ở sprint sau.
        </p>
      </CardContent>
    </Card>
  );
}
