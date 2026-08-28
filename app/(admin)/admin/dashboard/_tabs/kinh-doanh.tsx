// Tab "Kinh doanh" (khu vực C) — C1 · C2 · C3 · C4 + bảng C-03 / C-05.
//
// Nhận `filters` do page cha giải MỘT LẦN bằng `resolveScopeFilters()` — cả 4 tab dùng
// CHUNG một bộ lọc (A-02-3). Tab KHÔNG tự đọc searchParams: hai bộ parse lệch nhau là
// hỏng câm.
//
// ⚠️ ĐƠN VỊ ĐẾM LÀ HỌC SINH, không phải phụ huynh (CHUNG-2). Một PH hai con là HAI
// lead. Mọi nhãn trên màn phải nói "học sinh" — đọc nhầm đơn vị là so sai với mọi báo
// cáo cũ (những báo cáo đó đếm theo phụ huynh).

import Link from "next/link";
import type { Actor } from "@/lib/auth/actor";
import type { ScopeFilters } from "@/lib/reports/filters";
import {
  getCloseTimeStats,
  getConvertedChildren,
  getLeadFunnel,
  getLeadTargetAchievement,
  getLostChildren,
  getStaleLeads,
} from "@/lib/reports/lead-c";
import { formatDaysToClose } from "@/lib/reports/lead-kpi";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getGlobalSetting } from "@/lib/settings/read-global";
import { PhanTrangBang } from "@/components/ui/phan-trang-bang";

const vnd = (n: number) => n.toLocaleString("vi-VN") + "₫";
const pct = (r: number | null) => (r == null ? "—" : `${(r * 100).toFixed(1).replace(".", ",")}%`);
const dmy = (d: Date | null) => (d ? d.toLocaleDateString("vi-VN") : "—");

function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "warn";
}) {
  return (
    <div className="rounded-lg border border-border p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p
        className={
          tone === "warn"
            ? "mt-1 text-2xl font-bold text-amber-600"
            : "mt-1 text-2xl font-bold text-foreground"
        }
      >
        {value}
      </p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export async function TabKinhDoanh({
  actor,
  filters,
}: {
  actor: Actor;
  filters: ScopeFilters;
}) {
  const [funnel, target, closeTime, converted, lost, stale, warnDays, dangerDays] =
    await Promise.all([
      getLeadFunnel(actor, filters),
      getLeadTargetAchievement(actor, filters),
      getCloseTimeStats(actor, filters),
      getConvertedChildren(actor, filters),
      getLostChildren(actor, filters),
      getStaleLeads(actor, filters),
      // Nguong lay tu Cau hinh van hanh, khong viet cung.
      getGlobalSetting("crm.staleLeadWarnDays") as Promise<number>,
      getGlobalSetting("crm.staleLeadDangerDays") as Promise<number>,
    ]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Kinh doanh</CardTitle>
          <CardDescription>
            Đếm theo <strong>học sinh</strong>, không theo phụ huynh — một phụ huynh hai con là hai
            lead. Số ở đây không so thẳng được với các báo cáo lead cũ.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat
            label="Tổng lead (học sinh)"
            value={funnel.total.toLocaleString("vi-VN")}
            hint={
              funnel.duplicateCount > 0
                ? `trong đó trùng: ${funnel.duplicateCount}`
                : "trong đó trùng: 0"
            }
          />
          <Stat
            label="Tỷ lệ đạt mục tiêu"
            value={target.target == null ? "Chưa đặt mục tiêu" : pct(target.achievedRate)}
            hint={
              target.target == null
                ? `Kỳ ${target.periods.join(", ")} chưa có chỉ tiêu`
                : `${target.actual}/${target.target} học sinh · mẫu số là chỉ tiêu CẢ THÁNG${
                    target.paceRate != null ? ` · so với tiến độ tháng: ${pct(target.paceRate)}` : ""
                  }`
            }
          />
          <Stat
            label="Tỷ lệ thành công"
            value={pct(funnel.successRate)}
            hint={`${funnel.closed}/${funnel.total} · tính theo LỨA vào hệ thống — lứa của tháng đang chạy luôn thấp vì chưa kịp chín`}
          />
          <Stat
            label="Thời gian chốt trung bình"
            value={formatDaysToClose(closeTime.avg)}
            hint={
              closeTime.count === 0
                ? "Không có thương vụ nào chốt trong kỳ"
                : `trung vị ${formatDaysToClose(closeTime.median)} · p90 ${formatDaysToClose(closeTime.p90)} · ${closeTime.count} thương vụ`
            }
            tone={closeTime.droppedNegative > 0 ? "warn" : undefined}
          />
        </CardContent>
        {closeTime.droppedNegative > 0 && (
          <CardContent className="pt-0">
            <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              ⚠️ {closeTime.droppedNegative} bản ghi bị loại khỏi thời gian chốt vì ngày chốt nằm
              TRƯỚC ngày vào hệ thống. Đây là dữ liệu bẩn cần rà, không phải lỗi hiển thị.
            </p>
          </CardContent>
        )}
      </Card>

      {/* ── C-03 ─────────────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Lead đã chuyển đổi</CardTitle>
          <CardDescription>
            Một dòng một học sinh, xếp theo thời điểm chốt. Giá trị là <strong>thực thu</strong> đã
            xác nhận, không phải giá trị hợp đồng Sale cam kết.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {converted.unattributedRevenue > 0 && (
            <p className="mb-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              {vnd(converted.unattributedRevenue)} thực thu trong kỳ <strong>chưa quy được về học
              sinh nào</strong> (đơn của phụ huynh nhiều con — hệ thống cố ý không đoán). Tổng các
              dòng dưới đây vì thế nhỏ hơn tổng doanh thu.
            </p>
          )}
          <PhanTrangBang tenDonVi="học sinh đã chốt">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                  <th className="py-2 pr-3">Khách hàng</th>
                  <th className="py-2 pr-3">Khoá học</th>
                  <th className="py-2 pr-3">Cơ sở</th>
                  <th className="py-2 pr-3">Sale</th>
                  <th className="py-2 pr-3 text-right">Giá trị</th>
                  <th className="py-2 pr-3 text-right">% doanh thu</th>
                  <th className="py-2 pr-3">Vào hệ thống</th>
                  <th className="py-2 pr-3">Chốt</th>
                  <th className="py-2 pr-3 text-right">Thời gian chốt</th>
                </tr>
              </thead>
              <tbody>
                {converted.rows.length === 0 && (
                  <tr>
                    <td colSpan={9} className="py-8 text-center text-muted-foreground">
                      Không có học sinh nào chốt trong kỳ đang chọn.
                    </td>
                  </tr>
                )}
                {converted.rows.map((r) => (
                  <tr key={r.leadChildId} className="border-b border-border/60">
                    <td className="py-2 pr-3">
                      <Link href={`/admin/leads/${r.leadId}`} className="font-medium hover:underline">
                        {r.studentName}
                      </Link>
                      <span className="block text-xs text-muted-foreground">{r.parentName}</span>
                    </td>
                    <td className="py-2 pr-3">{r.courseName ?? "—"}</td>
                    <td className="py-2 pr-3">{r.centerName ?? "—"}</td>
                    <td className="py-2 pr-3">{r.saleName ?? "—"}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{vnd(r.revenue)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{pct(r.revenueShare)}</td>
                    <td className="py-2 pr-3">{dmy(r.createdAt)}</td>
                    <td className="py-2 pr-3">{dmy(r.closedAt)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {formatDaysToClose(r.daysToClose)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </PhanTrangBang>
        </CardContent>
      </Card>

      {/* ── C-05 ─────────────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Lead rớt</CardTitle>
          <CardDescription>
            Lý do rớt là ô ghi chú tự do ở cấp phụ huynh — đọc từng dòng được, nhưng{" "}
            <strong>không lọc/nhóm/đếm theo lý do</strong>. Phụ huynh có hai con rớt thì con sau ghi
            đè ghi chú của con trước.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PhanTrangBang tenDonVi="lead rớt">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                  <th className="py-2 pr-3">Khách hàng</th>
                  <th className="py-2 pr-3">Khoá học</th>
                  <th className="py-2 pr-3">Sale</th>
                  <th className="py-2 pr-3">Vào hệ thống</th>
                  <th className="py-2 pr-3">Tiếp cận gần nhất</th>
                  <th className="py-2 pr-3 text-right">Ngày chưa tiếp cận</th>
                  <th className="py-2 pr-3">Lý do rớt</th>
                </tr>
              </thead>
              <tbody>
                {lost.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-muted-foreground">
                      Không có lead rớt trong kỳ đang chọn.
                    </td>
                  </tr>
                )}
                {lost.map((r) => (
                  <tr key={r.leadChildId} className="border-b border-border/60">
                    <td className="py-2 pr-3">
                      <Link href={`/admin/leads/${r.leadId}`} className="font-medium hover:underline">
                        {r.studentName}
                      </Link>
                      <span className="block text-xs text-muted-foreground">{r.parentName}</span>
                    </td>
                    <td className="py-2 pr-3">{r.courseName ?? "—"}</td>
                    <td className="py-2 pr-3">{r.saleName ?? "—"}</td>
                    <td className="py-2 pr-3">{dmy(r.createdAt)}</td>
                    <td className="py-2 pr-3">
                      {r.lastContactAt ? dmy(r.lastContactAt) : "chưa tiếp cận lần nào"}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">{r.daysSinceContact}</td>
                    <td className="py-2 pr-3 max-w-[280px] truncate" title={r.lostNote ?? ""}>
                      {r.lostNote ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </PhanTrangBang>
        </CardContent>
      </Card>

      {/* ── C-05-2 ───────────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Lead đang chăm — lâu chưa tiếp cận</CardTitle>
          <CardDescription>
            Đồng hồ tính từ lần <strong>gọi / nhắn / ghi chú / email</strong> gần nhất do người thật
            thực hiện. Đổi trạng thái hay bàn giao <strong>không</strong> reset đồng hồ. Chưa tiếp
            cận lần nào thì đếm từ lúc lead vào hệ thống. Bảng này{" "}
            <strong>không theo khoảng ngày đang lọc</strong> — lead treo từ tháng trước vẫn phải hiện.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PhanTrangBang tenDonVi="lead đang chăm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                  <th className="py-2 pr-3">Phụ huynh</th>
                  <th className="py-2 pr-3">Điện thoại</th>
                  <th className="py-2 pr-3">Sale</th>
                  <th className="py-2 pr-3">Tiếp cận gần nhất</th>
                  <th className="py-2 pr-3 text-right">Số ngày</th>
                </tr>
              </thead>
              <tbody>
                {stale.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-muted-foreground">
                      Không có lead nào đang chăm trong phạm vi này.
                    </td>
                  </tr>
                )}
                {stale.map((r) => (
                  <tr key={r.leadId} className="border-b border-border/60">
                    <td className="py-2 pr-3">
                      <Link href={`/admin/leads/${r.leadId}`} className="font-medium hover:underline">
                        {r.parentName}
                      </Link>
                    </td>
                    <td className="py-2 pr-3 tabular-nums">{r.phone}</td>
                    <td className="py-2 pr-3">{r.saleName ?? "—"}</td>
                    <td className="py-2 pr-3">
                      {r.lastContactAt ? dmy(r.lastContactAt) : "chưa tiếp cận lần nào"}
                    </td>
                    <td
                      className={
                        r.daysSinceContact >= dangerDays
                          ? "py-2 pr-3 text-right font-bold tabular-nums text-red-600"
                          : r.daysSinceContact >= warnDays
                            ? "py-2 pr-3 text-right font-semibold tabular-nums text-amber-600"
                            : "py-2 pr-3 text-right tabular-nums"
                      }
                    >
                      {r.daysSinceContact}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </PhanTrangBang>
        </CardContent>
      </Card>
    </div>
  );
}
