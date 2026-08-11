import { redirect } from "next/navigation";
import { safeCache } from "@/lib/cache/safe-cache";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/auth/check-permission";
import { resolveActor, type Actor } from "@/lib/auth/actor";
import { scopedDb } from "@/lib/db-scope";
import { CACHE_TAGS } from "@/lib/cache/tags";
import { actorScopeKey } from "@/lib/cache/scope-key";
import { buildLeadReport, type LeadReportRecord } from "@/lib/reports/lead";
import {
  resolveReportFilters,
  reportFilterCacheKey,
  reportDateWhere,
  type ReportFilters,
} from "@/lib/reports/filters";
import { ReportFilterBar } from "@/components/admin/report-filter-bar";
import { FunnelChart } from "@/components/charts/funnel-chart";
import { BarChart } from "@/components/charts/bar-chart";
import { LineChart } from "@/components/charts/line-chart";

export const metadata = { title: "Báo cáo Lead | Admin" };
export const dynamic = "force-dynamic";

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
const num = (n: number) => n.toLocaleString("vi-VN");

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-bold text-foreground">{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <h2 className="mb-3 text-sm font-semibold text-foreground">{title}</h2>
      {children}
    </section>
  );
}

// REQ-05: tính báo cáo lead (fetch scoped + reduce thuần → object PRIMITIVE, không Date).
async function computeLeadReport(actor: Actor, filters: ReportFilters) {
  const sdb = scopedDb(actor); // Lead auto-scoped theo cơ sở (HO/SUPER_ADMIN bypass).
  const dateWhere = reportDateWhere(filters); // lọc theo Lead.createdAt.
  const [rows, centers] = await Promise.all([
    sdb.lead.findMany({
      where: {
        deletedAt: null,
        ...(filters.centerId ? { centerId: filters.centerId } : {}),
        ...(dateWhere ? { createdAt: dateWhere } : {}),
      },
      select: {
        status: true,
        source: true,
        centerId: true,
        commissionSource: true,
        createdAt: true,
        convertedAt: true,
      },
      take: 20_000,
    }),
    // Center KHÔNG thuộc SCOPED_MODELS → sdb pass-through (chỉ lấy id→tên để gắn nhãn).
    sdb.center.findMany({ select: { id: true, name: true } }),
  ]);

  const centerNames = Object.fromEntries(centers.map((c) => [c.id, c.name]));
  const records: LeadReportRecord[] = rows.map((r) => ({
    status: r.status,
    source: r.source,
    centerId: r.centerId,
    commissionSource: r.commissionSource,
    createdAt: r.createdAt,
    convertedAt: r.convertedAt,
  }));
  return buildLeadReport(records, centerNames);
}

export default async function LeadReportPage({
  searchParams,
}: {
  searchParams: Promise<{ center?: string; dateFrom?: string; dateTo?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (
    !(await checkPermission("leads:view-all")) &&
    !(await checkPermission("leads:view-own"))
  ) {
    redirect("/dashboard");
  }

  const actor = await resolveActor(session.user.id);
  const sp = await searchParams;
  const fc = await resolveReportFilters(actor, sp);

  // REQ-05: cache cross-request keyed THEO SCOPE (actorScopeKey bắt buộc → không leak
  // số liệu giữa cơ sở) + bộ lọc cơ sở/ngày. TTL 120s; output primitive nên serialize an toàn.
  const report = await safeCache(
    () => computeLeadReport(actor, fc.filters),
    ["lead-report", actorScopeKey(actor), reportFilterCacheKey(fc.filters)],
    { tags: [CACHE_TAGS.report], revalidate: 120 },
  )();

  return (
    <div className="space-y-5 p-4">
      <div>
        <h1 className="text-xl font-bold text-foreground">Báo cáo Lead</h1>
        <p className="text-sm text-muted-foreground">
          Phễu SR.QD.217 mở rộng — phân tích chuyển đổi theo bước, nguồn, cơ sở và tháng.
        </p>
      </div>

      <ReportFilterBar
        basePath="/bao-cao/lead"
        centers={fc.visibleCenters}
        selection={fc.selection}
        dateFrom={fc.dateFromStr}
        dateTo={fc.dateToStr}
        allowAll={fc.isGlobalAllowed}
      />

      {/* Thẻ số liệu tổng quan */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Tổng lead" value={num(report.summary.total)} />
        <Stat
          label="Đã chốt"
          value={num(report.summary.converted)}
          hint={`Tỷ lệ ${pct(report.summary.conversionRate)}`}
        />
        <Stat label="Đang xử lý" value={num(report.summary.active)} />
        <Stat label="Thất bại / trùng" value={num(report.summary.lost)} />
      </div>

      {report.summary.total === 0 ? (
        <p className="rounded-xl border border-dashed border-border bg-card p-6 text-center text-sm text-muted-foreground">
          Chưa có lead trong phạm vi của bạn.
        </p>
      ) : null}

      {/* Phễu chuyển đổi */}
      <Card title="Phễu chuyển đổi (số lead đã chạm tới mỗi bước)">
        <FunnelChart
          data={report.funnel.map((f) => ({ name: f.label, value: f.count }))}
          height={360}
        />
      </Card>

      {/* Tỷ lệ chuyển từng bước */}
      <Card title="Tỷ lệ chuyển từng bước">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Bước</th>
                <th className="px-3 py-2 text-right">Tỷ lệ chuyển</th>
              </tr>
            </thead>
            <tbody>
              {report.funnelConversion.map((c) => (
                <tr key={`${c.fromLabel}-${c.toLabel}`} className="border-t">
                  <td className="px-3 py-2">
                    {c.fromLabel} → {c.toLabel}
                  </td>
                  <td className="px-3 py-2 text-right font-medium">{pct(c.rate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Theo nguồn */}
      <Card title="Lead theo nguồn">
        <BarChart
          data={report.bySource.map((s) => ({
            name: s.label,
            "Tổng": s.total,
            "Đã chốt": s.converted,
          }))}
          xKey="name"
          bars={[
            { key: "Tổng", name: "Tổng", color: "#F97316" },
            { key: "Đã chốt", name: "Đã chốt", color: "#7C3AED" },
          ]}
          height={300}
        />
      </Card>

      {/* Theo cơ sở */}
      <Card title="Lead theo cơ sở">
        <BarChart
          data={report.byCenter.map((s) => ({
            name: s.label,
            "Tổng": s.total,
            "Đã chốt": s.converted,
          }))}
          xKey="name"
          bars={[
            { key: "Tổng", name: "Tổng", color: "#F97316" },
            { key: "Đã chốt", name: "Đã chốt", color: "#7C3AED" },
          ]}
          height={300}
        />
      </Card>

      {/* Theo tháng */}
      <Card title="Lead theo tháng">
        <LineChart
          data={report.byMonth.map((m) => ({
            name: m.month,
            "Tổng": m.total,
            "Đã chốt": m.converted,
          }))}
          xKey="name"
          lines={[
            { key: "Tổng", name: "Tổng", color: "#F97316" },
            { key: "Đã chốt", name: "Đã chốt", color: "#7C3AED" },
          ]}
          height={300}
        />
      </Card>

      {/* Theo nguồn hoa hồng */}
      <Card title="Lead theo nguồn hoa hồng">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Nguồn hoa hồng</th>
                <th className="px-3 py-2 text-right">Tổng</th>
                <th className="px-3 py-2 text-right">Đã chốt</th>
                <th className="px-3 py-2 text-right">Tỷ lệ</th>
              </tr>
            </thead>
            <tbody>
              {report.byCommissionSource.map((s) => (
                <tr key={s.key} className="border-t">
                  <td className="px-3 py-2">{s.label}</td>
                  <td className="px-3 py-2 text-right">{num(s.total)}</td>
                  <td className="px-3 py-2 text-right">{num(s.converted)}</td>
                  <td className="px-3 py-2 text-right font-medium">{pct(s.conversionRate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
