import { checkPermission } from "@/lib/auth/check-permission";
import type { Actor } from "@/lib/auth/actor";
import type { ScopeFilters } from "@/lib/reports/scope-filters";
import { getDailyRevenue, DAILY_REVENUE_MAX_DAYS } from "@/lib/reports/revenue-daily";
import { formatDayKeyDMY } from "@/lib/students/birthday-dates";
import { formatVndPlain } from "@/lib/format/money";
import { LineChart } from "@/components/charts/line-chart";
import { PhanTrangBang } from "@/components/ui/phan-trang-bang";
import { ChoDuLieu } from "../_components/cho-du-lieu";

/**
 * Tab Tài chính — khu vực B (B-02 hàng chỉ số 1 · B-03 hàng chỉ số 2 · **B-04 doanh thu
 * theo ngày** · B-05 import chi phí).
 *
 * B-04 đã nối số liệu thật; B-02/B-03/B-05 vẫn chờ (vế CHI chưa có bảng nào trong hệ
 * thống) nên phần dưới màn giữ khối `ChoDuLieu` — cố ý KHÔNG hiện thẻ "Chi phí: 0 ₫",
 * vì một thẻ 0 trông y hệt kết quả đo thật.
 *
 * Gate riêng của tab: trang `/dashboard-qlcs` mở bằng `dashboard:view`, nhưng SỐ TIỀN
 * thì không — vào được trang ≠ xem được tiền (ghi sẵn ở `lib/auth/page-gates.ts:219`).
 */
export async function TabTaiChinh({
  actor,
  filters,
  visibleCenters,
}: {
  actor: Actor;
  filters: ScopeFilters;
  visibleCenters: { id: string; name: string }[];
}) {
  if (!(await checkPermission("payments:view"))) {
    return (
      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="text-base font-semibold text-foreground">
          Tab Tài chính: bạn không có quyền xem số tiền
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
          Vào được dashboard không đồng nghĩa xem được doanh thu. Ba tab còn lại vẫn dùng
          được bình thường. Cần xem số tiền thì đề nghị quản trị viên cấp quyền
          &quot;Xem thanh toán&quot;.
        </p>
      </section>
    );
  }

  return (
    <div className="space-y-5">
      <DoanhThuTheoNgay actor={actor} filters={filters} visibleCenters={visibleCenters} />

      <ChoDuLieu
        maSpec="B-02 · B-03 · B-05"
        tieuDe="Chỉ số tài chính còn lại: chưa có vế CHI"
        giaiThich={
          "Doanh thu theo ngày (B-04) đã chạy trên dữ liệu thật ở khối trên. Phần còn " +
          "lại kẹt ở vế CHI: hệ thống hôm nay không có bảng chi phí vận hành, nên Chi " +
          "phí / Lợi nhuận / Dòng tiền chưa tính được từ dữ liệu. Cố ý không hiện thẻ " +
          "số 0 — một hàng chỉ số toàn 0 trông y hệt kết quả đo thật."
        }
        daCo={[
          "Doanh thu thực thu (đã trừ hoàn tiền + bút toán điều chỉnh) — lib/finance/thuc-thu.ts",
          "Mục tiêu doanh thu tháng × cơ sở (B-01) — bảng RevenueTarget + màn /bao-cao/doanh-thu",
        ]}
        chuaCo={[
          "Bảng chi phí vận hành + 3 quyền costs:view / costs:manage / costs:approve",
          "B-02 hàng chỉ số 1 (Mục tiêu · Doanh thu · Tỷ lệ hoàn thành) trên tab này",
          "B-03 hàng chỉ số 2 (Chi phí · Lợi nhuận · Dòng tiền)",
          "B-05 mẫu import chi phí (định nghĩa cột + kiểm tra + báo dòng lỗi)",
        ]}
      />
    </div>
  );
}

/** Bảng màu đường biểu đồ khi tách theo cơ sở. Quay vòng — 2–3 cơ sở là ca thật. */
const MAU_CO_SO = ["#F97316", "#7C3AED", "#0EA5E9", "#16A34A", "#DC2626", "#CA8A04"];
const MAU_TONG = "#0F172A";
const KEY_TONG = "tong";

async function DoanhThuTheoNgay({
  actor,
  filters,
  visibleCenters,
}: {
  actor: Actor;
  filters: ScopeFilters;
  visibleCenters: { id: string; name: string }[];
}) {
  const bc = await getDailyRevenue(actor, filters);
  const tenCoSo = new Map(visibleCenters.map((c) => [c.id, c.name]));
  const cot = bc.centerIds.map((id, i) => ({
    id,
    // Khoá chuỗi dữ liệu của biểu đồ có TIỀN TỐ: id cơ sở dùng thẳng làm khoá thì một
    // id trùng "ngay"/"tong" sẽ ĐÈ cột trục hoặc cột tổng, và đè im lặng.
    chartKey: `cs_${id}`,
    name: tenCoSo.get(id) ?? id,
    color: MAU_CO_SO[i % MAU_CO_SO.length]!,
  }));

  // Tổng các điểm ĐANG VẼ. Đặt cạnh `bc.total` (đi đường `aggregate`) để chênh lệch —
  // dấu hiệu duy nhất của việc quét bị cắt — không thể trốn ở đâu được.
  const tongDiem = bc.points.reduce((s, p) => s + p.revenue, 0);
  const lech = bc.total - tongDiem;
  const soNgayCo = bc.points.filter((p) => p.txnCount > 0).length;

  const duLieu = bc.points.map((p) => ({
    ngay: formatNhanNgay(p.day),
    [KEY_TONG]: p.revenue,
    ...(p.byCenter
      ? Object.fromEntries(cot.map((c) => [c.chartKey, p.byCenter![c.id] ?? 0]))
      : {}),
  }));

  const duong =
    cot.length > 0
      ? [
          ...cot.map((c) => ({ key: c.chartKey, name: c.name, color: c.color })),
          { key: KEY_TONG, name: "Tổng", color: MAU_TONG },
        ]
      : [{ key: KEY_TONG, name: "Thực thu", color: MAU_CO_SO[0]! }];

  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-foreground">
          Doanh thu chi tiết theo ngày
        </h2>
        <span className="rounded-full border border-border px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
          B-04
        </span>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <ONho nhan="Tổng thực thu trong khoảng" giaTri={formatVndPlain(bc.total)} />
        <ONho
          nhan="Số ngày trên trục"
          giaTri={`${bc.points.length} ngày`}
          phu={`${soNgayCo} ngày có phát sinh`}
        />
        <ONho
          nhan="Trung bình / ngày"
          giaTri={
            bc.points.length > 0
              ? formatVndPlain(Math.round(bc.total / bc.points.length))
              : "—"
          }
          phu="Chia đều cho MỌI ngày, kể cả ngày nghỉ"
        />
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        Thực thu = khoản kế toán đã xác nhận, đã trừ hoàn tiền và bút toán điều chỉnh,
        tính theo ngày tiền về (giờ Việt Nam). Ngày không phát sinh vẫn nằm trên trục với
        giá trị 0. Ngày có hoàn tiền lớn hơn tiền thu sẽ ra số âm — đó là số đúng.
      </p>

      {bc.rangeTrimmed ? (
        <p className="mt-2 rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          Khoảng bạn chọn dài hơn {DAILY_REVENUE_MAX_DAYS} ngày. Biểu đồ và bảng dưới đây
          chỉ tính từ {formatDayKeyDMY(bc.fromKey)} đến {formatDayKeyDMY(bc.toKey)} — mọi
          con số trong khối này đều theo khoảng đã cắt đó, không phải khoảng trên thanh lọc.
        </p>
      ) : null}

      {bc.truncated ? (
        <p className="mt-2 rounded-lg border border-red-300 bg-red-50 p-2.5 text-xs text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
          Khoảng này có quá nhiều giao dịch để dựng chi tiết từng ngày. Số liệu từng ngày
          chỉ đầy đủ đến hết{" "}
          {bc.completeThroughDay ? formatDayKeyDMY(bc.completeThroughDay) : "ngày đầu kỳ"};
          các ngày sau đó đang THIẾU. Ô &quot;Tổng thực thu&quot; phía trên vẫn đúng cho
          cả khoảng. Hãy thu hẹp khoảng ngày để xem đủ.
        </p>
      ) : null}

      {!bc.truncated && lech !== 0 ? (
        <p className="mt-2 rounded-lg border border-red-300 bg-red-50 p-2.5 text-xs text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
          Tổng các ngày ({formatVndPlain(tongDiem)}) không khớp tổng của khoảng (
          {formatVndPlain(bc.total)}). Đây là lỗi phần mềm, không phải số liệu — báo cho
          đội kỹ thuật trước khi dùng con số này.
        </p>
      ) : null}

      <div className="mt-4">
        <LineChart
          data={duLieu}
          xKey="ngay"
          lines={duong}
          height={300}
          yFormat="vnd-compact"
          showLegend={duong.length > 1}
        />
      </div>

      {/* Bảng đi kèm biểu đồ: biểu đồ cho HÌNH DẠNG, bảng cho con số chính xác.
          Phân trang chỉ cắt ở tầng hiển thị — biểu đồ phía trên vẫn vẽ đủ mọi ngày, nên
          không có chuyện "trang 2 mới thấy đỉnh". */}
      <div className="mt-4 overflow-x-auto rounded-lg border border-border">
        <PhanTrangBang tenDonVi="ngày" khoaGhiNho="qlcs-doanh-thu-ngay">
          <table className="w-full text-sm">
            <thead className="bg-muted">
              <tr className="text-left">
                <th className="px-3 py-2 font-medium text-muted-foreground">Ngày</th>
                {cot.map((c) => (
                  <th key={c.id} className="px-3 py-2 text-right font-medium text-muted-foreground">
                    {c.name}
                  </th>
                ))}
                <th className="px-3 py-2 text-right font-medium text-muted-foreground">
                  {cot.length > 0 ? "Tổng" : "Thực thu"}
                </th>
                <th className="px-3 py-2 text-right font-medium text-muted-foreground">
                  Số giao dịch
                </th>
              </tr>
            </thead>
            <tbody>
              {bc.points.map((p) => (
                <tr key={p.day} className="border-t border-border">
                  <td className="px-3 py-1.5 tabular-nums text-foreground">
                    {formatDayKeyDMY(p.day)}
                  </td>
                  {cot.map((c) => (
                    <td
                      key={c.id}
                      className={`px-3 py-1.5 text-right tabular-nums ${tone(p.byCenter?.[c.id] ?? 0)}`}
                    >
                      {formatVndPlain(p.byCenter?.[c.id] ?? 0)}
                    </td>
                  ))}
                  <td className={`px-3 py-1.5 text-right font-medium tabular-nums ${tone(p.revenue)}`}>
                    {formatVndPlain(p.revenue)}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">
                    {p.txnCount}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </PhanTrangBang>
      </div>
    </section>
  );
}

/** Ngày 0 là số ĐO ĐƯỢC, không phải thiếu dữ liệu — làm mờ, không ẩn. */
function tone(v: number): string {
  if (v < 0) return "text-red-600 dark:text-red-400";
  if (v === 0) return "text-muted-foreground";
  return "text-foreground";
}

function ONho({ nhan, giaTri, phu }: { nhan: string; giaTri: string; phu?: string }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="text-xs font-medium text-muted-foreground">{nhan}</p>
      <p className="mt-0.5 text-lg font-bold tabular-nums text-foreground">{giaTri}</p>
      {phu ? <p className="mt-0.5 text-[11px] text-muted-foreground">{phu}</p> : null}
    </div>
  );
}

/** "2026-08-15" → "15/08" — nhãn trục X. Bảng bên dưới mới hiện đủ cả năm. */
function formatNhanNgay(dayKey: string): string {
  const [, m, d] = dayKey.split("-");
  return `${d}/${m}`;
}
