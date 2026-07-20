import { redirect } from "next/navigation";
import { safeCache } from "@/lib/cache/safe-cache";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/auth/check-permission";
import { resolveActor, type Actor } from "@/lib/auth/actor";
import { scopedDb } from "@/lib/db-scope";
import { CACHE_TAGS } from "@/lib/cache/tags";
import { actorScopeKey } from "@/lib/cache/scope-key";
import { monthKeyVN } from "@/lib/reports/lead";
import {
  resolveReportFilters,
  reportFilterCacheKey,
  reportDateWhere,
  type ReportFilters,
} from "@/lib/reports/filters";
import { ReportFilterBar } from "@/components/admin/report-filter-bar";
import {
  buildRevenueTargetReport,
  revenueTargetSummary,
  type PaymentRecord,
  type RevenueTargetRow,
} from "@/lib/reports/revenue-target";
import { LineChart } from "@/components/charts/line-chart";
import { BarChart } from "@/components/charts/bar-chart";
import { RevenueTargetForm } from "./_components/revenue-target-form";

export const metadata = { title: "Báo cáo doanh thu vs mục tiêu | Admin" };
export const dynamic = "force-dynamic";

const pct = (n: number | null) => (n === null ? "—" : `${(n * 100).toFixed(1)}%`);
const vnd = (n: number) => `${n.toLocaleString("vi-VN")} ₫`;

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4">
      <p className="text-xs font-medium text-neutral-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-neutral-900">{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-neutral-400">{hint}</p> : null}
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-4">
      <h2 className="mb-3 text-sm font-semibold text-neutral-800">{title}</h2>
      {children}
    </section>
  );
}

type SearchParams = {
  searchParams: Promise<{ center?: string; dateFrom?: string; dateTo?: string }>;
};

// REQ-05: tính rows doanh thu vs mục tiêu (fetch scoped theo cơ sở đã chọn → PRIMITIVE).
// filters: cơ sở (Payment.centerId) + khoảng ngày trên NGÀY THANH TOÁN (Payment.paidDate).
// Bộ lọc null → giữ nguyên hành vi cũ.
async function computeRevenueRows(actor: Actor, filters: ReportFilters) {
  const sdb = scopedDb(actor);
  const dateWhere = reportDateWhere(filters);
  // Doanh thu THỰC = Σ Payment(accountantStatus=CONFIRMED, deletedAt:null) trong phạm vi.
  const [payments, targetRows] = await Promise.all([
    sdb.payment.findMany({
      where: {
        accountantStatus: "CONFIRMED",
        deletedAt: null,
        ...(filters.centerId ? { centerId: filters.centerId } : {}),
        ...(dateWhere ? { paidDate: dateWhere } : {}),
      },
      select: { amount: true, centerId: true, paidDate: true },
      take: 50_000,
    }),
    // RevenueTarget không scoped → tra theo đúng centerId đã chọn (null = toàn hệ thống).
    sdb.revenueTarget.findMany({
      where: { centerId: filters.centerId },
      select: { centerId: true, period: true, targetAmount: true },
    }),
  ]);

  const paymentRecords: PaymentRecord[] = payments.map((p) => ({
    amount: p.amount,
    centerId: p.centerId,
    paidDate: p.paidDate,
  }));
  const targets: RevenueTargetRow[] = targetRows.map((t) => ({
    centerId: t.centerId,
    period: t.period,
    targetAmount: t.targetAmount,
  }));

  return buildRevenueTargetReport(paymentRecords, targets);
}

export default async function RevenueTargetReportPage({ searchParams }: SearchParams) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!(await checkPermission("payments:manage"))) {
    redirect("/dashboard?error=unauthorized");
  }

  const actor = await resolveActor(session.user.id);
  const sp = await searchParams;
  // Bộ lọc dùng chung: cơ sở (IDOR-safe theo tầm nhìn) + khoảng ngày.
  const fc = await resolveReportFilters(actor, sp);
  const effectiveCenterId = fc.filters.centerId;

  // REQ-05: cache số liệu doanh thu theo (scope + bộ lọc). fc.filters đã được validate
  // IDOR ở resolveReportFilters → an toàn đưa vào key. TTL 120s. Output rows PRIMITIVE.
  const rows = await safeCache(
    () => computeRevenueRows(actor, fc.filters),
    ["revenue-report", actorScopeKey(actor), reportFilterCacheKey(fc.filters)],
    { tags: [CACHE_TAGS.report], revalidate: 120 },
  )();
  const summary = revenueTargetSummary(rows);
  const scopeLabel =
    effectiveCenterId === null
      ? "Toàn hệ thống"
      : (fc.visibleCenters.find((c) => c.id === effectiveCenterId)?.name ?? "Cơ sở");
  const currentPeriod = monthKeyVN(new Date());

  return (
    <div className="space-y-5 p-4">
      <div>
        <h1 className="text-xl font-bold text-neutral-900">Doanh thu vs mục tiêu</h1>
        <p className="text-sm text-neutral-500">
          Doanh thu thực (khoản đã được kế toán xác nhận) so với mục tiêu theo kỳ —
          phạm vi: <span className="font-medium">{scopeLabel}</span>.
        </p>
      </div>

      {/* Bộ lọc cơ sở + khoảng ngày */}
      <ReportFilterBar
        basePath="/bao-cao/doanh-thu"
        centers={fc.visibleCenters}
        selection={fc.selection}
        dateFrom={fc.dateFromStr}
        dateTo={fc.dateToStr}
        allowAll={fc.isGlobalAllowed}
      />

      {/* Thẻ tổng quan */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Doanh thu thực" value={vnd(summary.totalActual)} />
        <Stat label="Tổng mục tiêu" value={vnd(summary.totalTarget)} />
        <Stat
          label="Đạt mục tiêu"
          value={pct(summary.achievedRate)}
          hint={`${summary.reachedPeriods}/${summary.targetedPeriods} kỳ đạt`}
        />
        <Stat label="Số kỳ có mục tiêu" value={String(summary.targetedPeriods)} />
      </div>

      {/* Đặt / sửa mục tiêu */}
      <Card title="Đặt / sửa mục tiêu doanh thu">
        <RevenueTargetForm
          centers={fc.visibleCenters}
          canSetGlobal={fc.isGlobalAllowed}
          defaultCenterId={fc.selection}
          defaultPeriod={currentPeriod}
        />
        <p className="mt-2 text-xs text-neutral-400">
          Mục tiêu lưu theo (cơ sở, kỳ). Đặt lại cùng cơ sở + kỳ sẽ ghi đè giá trị cũ.
        </p>
      </Card>

      {/* Biểu đồ thực vs mục tiêu theo kỳ */}
      <Card title="Doanh thu thực vs mục tiêu theo kỳ">
        <BarChart
          data={rows.map((r) => ({
            name: r.period,
            "Thực": r.actual,
            "Mục tiêu": r.target ?? 0,
          }))}
          xKey="name"
          bars={[
            { key: "Thực", name: "Thực", color: "#F97316" },
            { key: "Mục tiêu", name: "Mục tiêu", color: "#7C3AED" },
          ]}
          height={300}
        />
      </Card>

      {/* Xu hướng % đạt */}
      <Card title="Tỉ lệ đạt mục tiêu theo kỳ (%)">
        <LineChart
          data={rows.map((r) => ({
            name: r.period,
            "% đạt": r.achievedRate === null ? 0 : Math.round(r.achievedRate * 100),
          }))}
          xKey="name"
          lines={[{ key: "% đạt", name: "% đạt", color: "#16A34A" }]}
          height={260}
        />
      </Card>

      {/* Bảng chi tiết */}
      <Card title="Chi tiết theo kỳ">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-neutral-400">
              <tr>
                <th className="px-3 py-2">Kỳ</th>
                <th className="px-3 py-2 text-right">Doanh thu thực</th>
                <th className="px-3 py-2 text-right">Mục tiêu</th>
                <th className="px-3 py-2 text-right">Chênh lệch</th>
                <th className="px-3 py-2 text-right">% đạt</th>
                <th className="px-3 py-2 text-center">Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.period} className="border-t">
                  <td className="px-3 py-2">{r.period}</td>
                  <td className="px-3 py-2 text-right">{vnd(r.actual)}</td>
                  <td className="px-3 py-2 text-right">
                    {r.target === null ? "—" : vnd(r.target)}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {r.variance === null ? "—" : vnd(r.variance)}
                  </td>
                  <td className="px-3 py-2 text-right font-medium">{pct(r.achievedRate)}</td>
                  <td className="px-3 py-2 text-center">
                    {r.target === null ? (
                      <span className="text-neutral-400">Chưa đặt</span>
                    ) : r.reached ? (
                      <span className="text-green-600">Đạt</span>
                    ) : (
                      <span className="text-orange-600">Chưa đạt</span>
                    )}
                  </td>
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr>
                  <td className="px-3 py-4 text-center text-neutral-400" colSpan={6}>
                    Chưa có doanh thu hay mục tiêu trong phạm vi này.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
