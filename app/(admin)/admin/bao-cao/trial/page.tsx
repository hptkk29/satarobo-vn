import { redirect } from "next/navigation";
import { safeCache } from "@/lib/cache/safe-cache";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/auth/check-permission";
import { resolveActor, type Actor } from "@/lib/auth/actor";
import { scopedDb } from "@/lib/db-scope";
import { CACHE_TAGS } from "@/lib/cache/tags";
import { actorScopeKey } from "@/lib/cache/scope-key";
import { buildTrialReport, type TrialEnrollmentRec } from "@/lib/reports/trial";
import {
  resolveReportFilters,
  reportFilterCacheKey,
  reportDateWhere,
  type ReportFilters,
} from "@/lib/reports/filters";
import { ReportFilterBar } from "@/components/admin/report-filter-bar";
import { BarChart } from "@/components/charts/bar-chart";
import { FunnelChart } from "@/components/charts/funnel-chart";

export const metadata = { title: "Báo cáo lớp trải nghiệm | Admin" };
export const dynamic = "force-dynamic";

function Stat({
  label,
  value,
  sub,
}: {
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-bold text-foreground">{value}</div>
      {sub ? <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div> : null}
    </div>
  );
}

// REQ-05: tính báo cáo trial (fetch scoped + reduce thuần → object PRIMITIVE).
async function computeTrialReport(actor: Actor, filters: ReportFilters) {
  const sdb = scopedDb(actor); // TrialClassV2 auto-scope theo cơ sở (HO/SUPER_ADMIN bypass)
  const dateWhere = reportDateWhere(filters); // lọc theo TrialClassV2.createdAt.

  // 1) Lớp trải nghiệm trong phạm vi cơ sở (+ bộ lọc cơ sở/ngày). Giới hạn lớp ở đây
  //    kéo theo giới hạn enrollment/điểm danh bên dưới (đều suy từ classIds).
  const classes = await sdb.trialClassV2.findMany({
    where: {
      ...(filters.centerId ? { centerId: filters.centerId } : {}),
      ...(dateWhere ? { createdAt: dateWhere } : {}),
    },
    select: { id: true, centerId: true, capacity: true, status: true, sessionCount: true },
    take: 1000,
  });
  const classIds = classes.map((c) => c.id);

  // 2) Enrollment + LeadChild.trialStatus + Lead.status (lọc theo lớp đã scope).
  //    TrialEnrollment/TrialAttendance không nằm trong SCOPED_MODELS → cách ly qua
  //    classIds (đã scope ở bước 1). Nested include chỉ đọc field non-scoped.
  const enrollmentRows =
    classIds.length === 0
      ? []
      : await sdb.trialEnrollment.findMany({
          where: { trialClassId: { in: classIds } },
          select: {
            id: true,
            trialClassId: true,
            leadChildId: true,
            status: true,
            leadChild: {
              select: { trialStatus: true, lead: { select: { status: true } } },
            },
          },
          take: 5000,
        });

  const enrollments: TrialEnrollmentRec[] = enrollmentRows.map((e) => ({
    id: e.id,
    trialClassId: e.trialClassId,
    leadChildId: e.leadChildId,
    status: e.status,
    leadChildTrialStatus: e.leadChild.trialStatus,
    leadStatus: e.leadChild.lead?.status ?? null,
  }));

  // 3) Điểm danh (chỉ enrollment trong phạm vi).
  const enrollmentIds = enrollments.map((e) => e.id);
  const attendances =
    enrollmentIds.length === 0
      ? []
      : await sdb.trialAttendance.findMany({
          where: { trialEnrollmentId: { in: enrollmentIds } },
          select: { trialEnrollmentId: true, status: true },
          take: 20000,
        });

  return buildTrialReport({ classes, enrollments, attendances });
}

export default async function TrialReportPage({
  searchParams,
}: {
  searchParams: Promise<{ center?: string; dateFrom?: string; dateTo?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!(await checkPermission("trials:view"))) redirect("/dashboard");

  const actor = await resolveActor(session.user.id);
  const sp = await searchParams;
  const fc = await resolveReportFilters(actor, sp);

  // REQ-05: cache phần nặng (query + reduce) theo scope + bộ lọc. TTL 120s. Output primitive.
  const report = await safeCache(
    () => computeTrialReport(actor, fc.filters),
    ["trial-report", actorScopeKey(actor), reportFilterCacheKey(fc.filters)],
    { tags: [CACHE_TAGS.report], revalidate: 120 },
  )();

  // Tên cơ sở để gắn nhãn — query nhỏ, giữ LIVE (Map không serialize được nên không cache).
  const centerRows = await scopedDb(actor).center.findMany({
    select: { id: true, name: true, code: true },
  });
  const centerName = new Map(
    centerRows.map((c) => [c.id, c.code ? `${c.code} · ${c.name}` : c.name]),
  );

  const funnelData = [
    { name: "Đã xếp lịch", value: report.funnel.scheduled + report.funnel.inProgress + report.funnel.attended },
    { name: "Đang học thử", value: report.funnel.inProgress + report.funnel.attended },
    { name: "Đã dự đủ", value: report.funnel.attended },
    { name: "Đã đăng ký", value: report.conversion.registered },
  ];

  const centerChart = report.byCenter.map((c) => ({
    center: centerName.get(c.centerId) ?? c.centerId,
    fillRate: c.fillRate,
    conversionRate: c.conversionRate,
    fullAttendanceRate: c.fullAttendanceRate,
  }));

  return (
    <div className="space-y-6 p-4">
      <div>
        <h1 className="text-xl font-bold text-foreground">Báo cáo lớp trải nghiệm</h1>
        <p className="text-sm text-muted-foreground">
          Sĩ số lấp đầy, tỷ lệ dự đủ buổi, chuyển đổi học thử → đăng ký, theo cơ sở.
        </p>
      </div>

      <ReportFilterBar
        basePath="/bao-cao/trial"
        centers={fc.visibleCenters}
        selection={fc.selection}
        dateFrom={fc.dateFromStr}
        dateTo={fc.dateToStr}
        allowAll={fc.isGlobalAllowed}
      />

      {/* Thẻ số liệu */}
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Sĩ số lấp đầy"
          value={`${report.totals.fillRate}%`}
          sub={`${report.totals.filled}/${report.totals.capacity} chỗ · ${report.totals.classes} lớp`}
        />
        <Stat
          label="Dự đủ N buổi"
          value={`${report.attendance.fullRate}%`}
          sub={`${report.attendance.full}/${report.attendance.total} học viên`}
        />
        <Stat
          label="Chuyển đổi trial → đăng ký"
          value={`${report.conversion.rate}%`}
          sub={`${report.conversion.registered}/${report.conversion.attended} đã dự đủ`}
        />
        <Stat
          label="Đang học thử"
          value={report.funnel.inProgress + report.funnel.attended}
          sub={`Xếp lịch: ${report.funnel.scheduled} · Đã dự: ${report.funnel.attended}`}
        />
      </section>

      {/* Phễu chuyển đổi */}
      <section className="rounded-xl border border-border bg-card p-4">
        <h2 className="mb-2 text-sm font-semibold text-foreground">
          Phễu học thử → đăng ký
        </h2>
        {funnelData[0].value > 0 ? (
          <FunnelChart data={funnelData} height={320} />
        ) : (
          <p className="py-8 text-center text-sm text-muted-foreground">Chưa có dữ liệu học thử.</p>
        )}
      </section>

      {/* So sánh theo cơ sở */}
      <section className="rounded-xl border border-border bg-card p-4">
        <h2 className="mb-2 text-sm font-semibold text-foreground">Theo cơ sở (%)</h2>
        {centerChart.length > 0 ? (
          <BarChart
            data={centerChart}
            xKey="center"
            height={320}
            bars={[
              { key: "fillRate", name: "Lấp đầy", color: "#F97316" },
              { key: "fullAttendanceRate", name: "Dự đủ buổi", color: "#7C3AED" },
              { key: "conversionRate", name: "Chuyển đổi", color: "#22C55E" },
            ]}
          />
        ) : (
          <p className="py-8 text-center text-sm text-muted-foreground">Chưa có lớp trải nghiệm.</p>
        )}
      </section>

      {/* Bảng chi tiết theo cơ sở */}
      <section className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-2">Cơ sở</th>
              <th className="px-4 py-2 text-right">Lớp</th>
              <th className="px-4 py-2 text-right">Lấp đầy</th>
              <th className="px-4 py-2 text-right">Dự đủ buổi</th>
              <th className="px-4 py-2 text-right">Đã dự / Đăng ký</th>
              <th className="px-4 py-2 text-right">Chuyển đổi</th>
            </tr>
          </thead>
          <tbody>
            {report.byCenter.map((c) => (
              <tr key={c.centerId} className="border-t">
                <td className="px-4 py-2 font-medium">
                  {centerName.get(c.centerId) ?? c.centerId}
                </td>
                <td className="px-4 py-2 text-right">{c.classes}</td>
                <td className="px-4 py-2 text-right">
                  {c.fillRate}%
                  <span className="text-muted-foreground"> ({c.filled}/{c.capacity})</span>
                </td>
                <td className="px-4 py-2 text-right">
                  {c.fullAttendanceRate}% ({c.fullAttendance})
                </td>
                <td className="px-4 py-2 text-right">
                  {c.attended} / {c.registered}
                </td>
                <td className="px-4 py-2 text-right">{c.conversionRate}%</td>
              </tr>
            ))}
            {report.byCenter.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">
                  Chưa có lớp trải nghiệm trong phạm vi.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>
    </div>
  );
}
