// Tab "Tài chính" (khu vực B) — B1 · B2 · B3 · B4 · B5 · B6.
//
// Nhận `filters` do page cha giải MỘT LẦN bằng `resolveScopeFilters()` — cả 4 tab dùng
// CHUNG một bộ lọc (A-02-3). Tab KHÔNG tự đọc searchParams: hai bộ parse lệch nhau là
// hỏng câm.
//
// 🔴 HAI ĐIỀU PHẢI NÓI RA TRÊN MÀN, không được để người dùng tự suy:
//  1. **B1 thấp hơn** con số ba màn cũ đang hiện, đúng bằng (tổng hoàn tiền) + (chênh
//     lệch điều chỉnh). Không nói thì người dùng báo "hệ thống mất doanh thu".
//  2. **B2 chưa đủ vế** — chi phí quảng cáo đọc từ D1 mà nhánh D còn chờ token Meta
//     (OQ-D4). Vì thế B2/B3/B4 hiện "chưa đủ dữ liệu", KHÔNG hiện một con số thiếu vế.
//     Hiện số thiếu vế ở ô "Lợi nhuận" là báo lãi cao hơn thực tế.

import type { Actor } from "@/lib/auth/actor";
import type { ScopeFilters } from "@/lib/reports/filters";
import { getFinanceSummary, getMoneyReconciliation, getRevenueByDay } from "@/lib/finance/cost";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PhanTrangBang } from "@/components/ui/phan-trang-bang";

const vnd = (n: number) => n.toLocaleString("vi-VN") + "₫";

function Stat({
  label,
  value,
  hint,
  muted,
}: {
  label: string;
  value: string;
  hint?: string;
  muted?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p
        className={
          muted
            ? "mt-1 text-lg font-semibold text-muted-foreground"
            : "mt-1 text-2xl font-bold text-foreground"
        }
      >
        {value}
      </p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export async function TabTaiChinh({ actor, filters }: { actor: Actor; filters: ScopeFilters }) {
  const [summary, recon, byDay] = await Promise.all([
    getFinanceSummary(actor, filters),
    getMoneyReconciliation(actor, filters),
    getRevenueByDay(actor, filters),
  ]);

  const { cost } = summary;
  const adsMissing = cost.adsSpend === null;
  const chuaDu = "Chưa đủ dữ liệu";

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tài chính</CardTitle>
          <CardDescription>
            Doanh thu là <strong>thực thu THUẦN</strong>: đã trừ hoàn tiền và đã thay bản gốc
            bằng bản điều chỉnh. Vì thế số ở đây <strong>thấp hơn</strong> các màn báo cáo cũ
            — chênh lệch đúng bằng tổng hoàn tiền cộng chênh lệch điều chỉnh, không phải mất
            dữ liệu.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat
            label="Doanh thu (thực thu)"
            value={vnd(summary.netRevenue)}
            hint={`Bản gộp như màn cũ: ${vnd(summary.grossRevenue)}`}
          />
          <Stat
            label="Chi phí"
            value={cost.total === null ? chuaDu : vnd(cost.total)}
            muted={adsMissing}
            hint={
              adsMissing
                ? `Đã có ${vnd(cost.centerTotal + cost.companyTotal)} chi nhập tay/import đã duyệt — còn thiếu chi phí quảng cáo`
                : `Cơ sở ${vnd(cost.centerTotal)} · công ty ${vnd(cost.companyTotal)} · quảng cáo ${vnd(cost.adsSpend ?? 0)}`
            }
          />
          <Stat
            label="Lợi nhuận"
            value={summary.profit === null ? chuaDu : vnd(summary.profit)}
            muted={summary.profit === null}
            hint="Lợi nhuận vận hành thô: doanh thu − chi phí. Không khấu hao, không thuế."
          />
          <Stat
            label="Dòng tiền"
            value={summary.cashflow === null ? chuaDu : vnd(summary.cashflow)}
            muted={summary.cashflow === null}
            hint="Thu đã ghi nhận − chi đã duyệt. Xem bảng đối soát bên dưới để biết khoảng cách với tiền vật lý."
          />
        </CardContent>
        {adsMissing && (
          <CardContent className="pt-0">
            <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              ⚠️ <strong>Chi phí / Lợi nhuận / Dòng tiền chưa tính được.</strong> Chi phí quảng
              cáo phải đọc từ đồng bộ Meta, mà nhánh đó còn chờ loại token quảng cáo (OQ-D4).
              Ba ô trên cố ý hiện &ldquo;{chuaDu}&rdquo; thay vì một con số thiếu vế — hiện số
              thiếu vế ở ô Lợi nhuận là <strong>báo lãi cao hơn thực tế</strong>.
            </p>
          </CardContent>
        )}
      </Card>

      {/* ── B2 chi tiết ──────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Chi phí theo đầu mục</CardTitle>
          <CardDescription>
            Chỉ tính khoản <strong>đã duyệt</strong>. Chi phí cấp công ty (thuê văn phòng hội
            sở, lương hội sở) để <strong>dòng riêng</strong> và{" "}
            <strong>không phân bổ về cơ sở</strong> ở phiên bản này — nên đừng cộng cột của
            hai cơ sở lại rồi so với tổng công ty.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PhanTrangBang tenDonVi="đầu mục chi">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                  <th className="py-2 pr-3">Đầu mục</th>
                  <th className="py-2 pr-3">Phạm vi</th>
                  <th className="py-2 pr-3 text-right">Số tiền</th>
                </tr>
              </thead>
              <tbody>
                {cost.byCategory.length === 0 && cost.companyByCategory.length === 0 && (
                  <tr>
                    <td colSpan={3} className="py-8 text-center text-muted-foreground">
                      Chưa có khoản chi nào đã duyệt trong kỳ.
                    </td>
                  </tr>
                )}
                {cost.byCategory.map((c) => (
                  <tr key={`ct-${c.categoryId}`} className="border-b border-border/60">
                    <td className="py-2 pr-3">{c.label}</td>
                    <td className="py-2 pr-3 text-muted-foreground">Cơ sở</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{vnd(c.amount)}</td>
                  </tr>
                ))}
                {cost.companyByCategory.map((c) => (
                  <tr key={`co-${c.categoryId}`} className="border-b border-border/60">
                    <td className="py-2 pr-3">{c.label}</td>
                    <td className="py-2 pr-3 text-muted-foreground">Cấp công ty</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{vnd(c.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </PhanTrangBang>
        </CardContent>
      </Card>

      {/* ── Đối soát 3 lớp tiền (bắt buộc đi kèm B4) ─────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Đối soát 3 lớp tiền</CardTitle>
          <CardDescription>
            Ba con số này <strong>không bằng nhau và không nên bằng nhau</strong> — khoảng cách
            giữa chúng chính là thông tin cần nhìn.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          <Stat
            label="1 · Tiền về ngân hàng"
            value={vnd(recon.bankIn)}
            hint="KHÔNG gồm tiền mặt — tiền mặt không đi qua ngân hàng."
          />
          <Stat
            label="2 · Đã ghi nhận trên sổ"
            value={vnd(recon.recorded)}
            hint="Gồm cả khoản kế toán CHƯA xác nhận."
          />
          <Stat
            label="3 · Doanh thu thuần"
            value={vnd(recon.netRevenue)}
            hint="Đã xác nhận, đã trừ hoàn tiền và bản điều chỉnh."
          />
        </CardContent>
      </Card>

      {/* ── B5 ───────────────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Doanh thu theo ngày</CardTitle>
          <CardDescription>
            Trục ngày theo <strong>lịch Việt Nam</strong>. Ngày không có giao dịch vẫn hiện
            dòng 0 — bảng nhảy cóc qua ngày trống sẽ đọc như tháng ít ngày hơn thực tế.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PhanTrangBang tenDonVi="ngày">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                  <th className="py-2 pr-3">Ngày</th>
                  <th className="py-2 pr-3 text-right">Doanh thu thuần</th>
                </tr>
              </thead>
              <tbody>
                {byDay.length === 0 && (
                  <tr>
                    <td colSpan={2} className="py-8 text-center text-muted-foreground">
                      Khoảng ngày đang chọn không có dữ liệu.
                    </td>
                  </tr>
                )}
                {byDay.map((d) => (
                  <tr key={d.day} className="border-b border-border/60">
                    <td className="py-2 pr-3 tabular-nums">{d.day}</td>
                    <td
                      className={
                        d.amount < 0
                          ? "py-2 pr-3 text-right tabular-nums text-red-600"
                          : "py-2 pr-3 text-right tabular-nums"
                      }
                    >
                      {vnd(d.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </PhanTrangBang>
        </CardContent>
      </Card>
    </div>
  );
}
