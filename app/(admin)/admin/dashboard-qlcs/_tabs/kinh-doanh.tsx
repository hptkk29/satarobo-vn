import { checkPermission, canViewLeadPii } from "@/lib/auth/check-permission";
import type { Actor } from "@/lib/auth/actor";
import type { ScopeFilters } from "@/lib/reports/scope-filters";
import { getLostLeadRows } from "@/lib/reports/lost-leads";
import { loadStaleLeadThresholdsByCenter } from "@/lib/lead/stale-lead-config";
import { ChoDuLieu } from "../_components/cho-du-lieu";
import { BangLeadRot } from "./_bang-lead-rot";

/**
 * Tab Kinh doanh — khu vực C (C-02 khối chỉ số lead · C-03 bảng lead đã chuyển đổi ·
 * C-04 xuất Excel · **C-05 bảng lead rớt**).
 *
 * C-05 đã nối số liệu thật; C-02/C-03/C-04 vẫn chờ nên phần dưới màn giữ khối `ChoDuLieu`
 * — cố ý KHÔNG hiện thẻ "Tổng lead: 0", vì một thẻ 0 trông y hệt kết quả đo thật.
 *
 * Gate riêng của tab: trang `/dashboard-qlcs` mở bằng `dashboard:view`, nhưng danh sách
 * lead thì không — chốt 24/08 ghi rõ tab C đi bằng `leads:view-all`
 * (`lib/auth/permissions.ts`). Cố ý KHÔNG nhận `leads:view-own` làm cửa thay thế: bảng
 * này là công cụ SOI của quản lý, cho người chỉ thấy phiếu của mình vào đây là đưa họ một
 * bảng thiếu mà không có gì trên màn nói rằng nó thiếu.
 */
export async function TabKinhDoanh({
  actor,
  filters,
  visibleCenters,
  dateFromStr,
  dateToStr,
}: {
  actor: Actor;
  filters: ScopeFilters;
  visibleCenters: { id: string; name: string }[];
  /** Khoá ngày ĐÃ chuẩn hoá của bộ lọc chung — nhận lại chứ không tự quy từ `Date`. */
  dateFromStr: string;
  dateToStr: string;
}) {
  if (!(await checkPermission("leads:view-all"))) {
    return (
      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="text-base font-semibold text-foreground">
          Tab Kinh doanh: bạn không có quyền xem danh sách lead
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
          Vào được dashboard không đồng nghĩa xem được toàn bộ lead của cơ sở. Ba tab còn
          lại vẫn dùng được bình thường. Cần xem thì đề nghị quản trị viên cấp quyền
          &quot;Xem tất cả lead&quot;.
        </p>
      </section>
    );
  }

  // Hai ngưỡng cảnh báo là `centerOverridable` (quyết định 12(a)) ⇒ lấy theo TỪNG cơ sở
  // rồi áp cho đúng phiếu của cơ sở đó. Lấy một bộ chung cho cả bảng là cùng một phiếu
  // đổi màu tuỳ người xem đang mở một cơ sở hay nhiều cơ sở.
  const [nguong, coQuyenPii] = await Promise.all([
    loadStaleLeadThresholdsByCenter(filters.centerIds),
    canViewLeadPii(),
  ]);

  const bc = await getLostLeadRows(actor, filters, {
    canViewPii: coQuyenPii,
    thresholdsFor: (centerId) =>
      (centerId ? nguong.byCenter.get(centerId) : undefined) ?? nguong.fallback,
  });

  // Ngưỡng ĐỂ VIẾT RA BẰNG CHỮ: đúng một cơ sở thì nói ngưỡng của cơ sở đó; nhiều cơ sở
  // thì nói ngưỡng chung (từng dòng vẫn tính theo cơ sở của nó).
  const nguongHienThi =
    filters.centerIds.length === 1
      ? (nguong.byCenter.get(filters.centerIds[0]!) ?? nguong.fallback)
      : nguong.fallback;

  return (
    <div className="space-y-5">
      <BangLeadRot
        bc={bc}
        centerNameById={new Map(visibleCenters.map((c) => [c.id, c.name]))}
        hienCotCoSo={filters.centerIds.length > 1}
        thresholds={nguongHienThi}
        dateFromStr={dateFromStr}
        dateToStr={dateToStr}
      />

      <ChoDuLieu
        maSpec="C-02 · C-03 · C-04"
        tieuDe="Chỉ số lead và bảng lead đã chuyển đổi: chưa nối vào màn"
        giaiThich={
          "Bảng lead rớt (C-05) ở trên đã chạy trên dữ liệu thật, kèm hai cột lần tiếp " +
          "cận gần nhất và số ngày chưa tiếp cận lại. Phần còn lại của khu vực C vẫn " +
          "thiếu hàm gom số cho khoảng ngày đang lọc."
        }
        daCo={[
          "Chỉ tiêu lead theo tháng × cơ sở (C-01) — bảng LeadTarget + màn /bao-cao/muc-tieu-lead",
          "Doanh thu thực thu quy về từng con (nền của C-03) — lib/reports/revenue-by-child.ts",
          "Mốc chốt + giá trị hợp đồng theo từng con (G-06) — LeadChild.closedAt / contractValue",
        ]}
        chuaCo={[
          "C-02 tổng lead · tỷ lệ đạt chỉ tiêu · tỷ lệ chốt, theo khoảng ngày đang lọc",
          "C-03 bảng lead đã chuyển đổi (giá trị, % trên tổng doanh thu, thời gian chốt)",
          "C-04 xuất Excel bảng C-03 (áp quyền xuất lead của A-03)",
        ]}
      />
    </div>
  );
}
