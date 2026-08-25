// A-02 — khung tab "Tương tác KH" (khu vực E). PLACEHOLDER: chưa đọc dữ liệu nào.
//
// Nhận `filters` do page cha giải MỘT LẦN bằng `resolveScopeFilters()` — cả 4 tab dùng
// CHUNG một bộ lọc (A-02-3). Tab KHÔNG tự đọc searchParams: hai bộ parse lệch nhau là
// hỏng câm. Mọi hàm số liệu nối vào đây phải nhận `groupByCenter` NGAY TỪ BẢN ĐẦU
// (§6.2 bẫy 4) — viết cứng dạng gộp rồi "thêm tách sau" là viết lại cả tầng truy vấn.
//
// ⚠️ A-02-7 / L-A9 — CHẶN CỨNG trước khi nối số liệu: `Conversation` nằm trong
// `SCOPE_EXEMPT` (`lib/db-scope.ts` — quyền chat là PARTICIPANT-BASED, DM có
// `centerId = null`) ⇒ tab này CHƯA được bật "Tất cả cơ sở"; màn quản trị phải lọc
// TAY theo `getVisibleCenterIds(actor)` như US-15 đã làm.
//
// E-10 / L-E7: QLCS giữ CS1 + CS2 phải đếm GỘP cả hai — dùng `centerId: { in: ... }`
// từ bộ lọc A-02, KHÔNG đọc `session.user.centerId`.

import type { ScopeFilters } from "@/lib/reports/filters";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function TabTuongTacKh({ filters }: { filters: ScopeFilters }) {
  void filters; // seam: sprint sau đọc `centerIds` / `dateFrom` / `dateTo` / `groupByCenter` từ đây.
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Tương tác KH</CardTitle>
        <CardDescription>Mức độ tương tác của phụ huynh theo phạm vi đang chọn.</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="rounded-md border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
          Chưa có dữ liệu — sẽ dựng ở sprint sau.
        </p>
      </CardContent>
    </Card>
  );
}
