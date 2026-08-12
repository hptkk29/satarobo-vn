import Link from "next/link";
import { safeCache } from "@/lib/cache/safe-cache";
import { Users, CheckSquare, FlaskConical, TrendingUp, GraduationCap } from "lucide-react";
import { resolveActor } from "@/lib/auth/actor";
import { scopedDb, getModelVisibleCenterIds } from "@/lib/db-scope";
import { KANBAN_COLUMNS, LEAD_STATUS_LABEL, LEAD_STATUS_BADGE } from "@/lib/leads/status";
import { getNearingEndEnrollments } from "@/lib/students/renewal";
import { groupByWeek, type LeadReportRecord } from "@/lib/reports/lead";
import { BarChart } from "@/components/charts/bar-chart";
import { CACHE_TAGS } from "@/lib/cache/tags";
import { formatDateVN } from "@/lib/format/date";

// REQ-04: số liệu tổng hợp dashboard sale. Data THEO USER (assignedToId=userId) → cache
// key = userId. Output PRIMITIVE (countByStatus là object, weeklyBars {string,number},
// đếm số — KHÔNG Date/Map). Việc-cần-làm + học-thử (có Date) giữ LIVE ở component.
async function getSalesStats(userId: string) {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const eightWeeksAgo = new Date(now.getTime() - 8 * 7 * 86_400_000);
  const actor = await resolveActor(userId);
  const sdb = scopedDb(actor);

  const [pipeline, totalMine, enrolledMonth, nearingEnd, leadsForWeekly] = await Promise.all([
    sdb.lead.groupBy({ by: ["status"], where: { assignedToId: userId, deletedAt: null }, _count: { _all: true } }),
    sdb.lead.count({ where: { assignedToId: userId, deletedAt: null } }),
    sdb.lead.count({ where: { assignedToId: userId, deletedAt: null, status: "ENROLLED", updatedAt: { gte: monthStart } } }),
    getNearingEndEnrollments(),
    // Phễu lead theo TUẦN (8 tuần) — lead CỦA TÔI: tổng mới vs chuyển đổi.
    sdb.lead.findMany({
      where: { assignedToId: userId, deletedAt: null, createdAt: { gte: eightWeeksAgo } },
      select: { createdAt: true, status: true },
    }),
  ]);

  const countByStatus: Record<string, number> = {};
  for (const p of pipeline) countByStatus[p.status] = p._count._all;
  const weeklyRecords: LeadReportRecord[] = leadsForWeekly.map((l) => ({
    status: l.status,
    source: null,
    centerId: null,
    commissionSource: null,
    createdAt: l.createdAt,
  }));
  const weeklyBars = groupByWeek(weeklyRecords, 8, now).map((w) => ({
    week: w.label,
    total: w.total,
    converted: w.converted,
  }));
  const closeRate = totalMine > 0 ? Math.round(((countByStatus["ENROLLED"] ?? 0) / totalMine) * 100) : 0;

  return { totalMine, enrolledMonth, closeRate, countByStatus, weeklyBars, nearingEndCount: nearingEnd.length };
}

// Đợt 3C — Dashboard SALES_CSM. Chỉ lead/việc CỦA TÔI. KHÔNG tài chính/quản trị.
export async function SalesDashboard({ userId, name, embedded = false }: { userId: string; name: string; embedded?: boolean }) {
  const now = new Date();
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);

  // Live (KHÔNG cache — có Date so sánh/hiển thị): việc cần làm (dueAt) + học thử sắp tới.
  const actor = await resolveActor(userId);
  const sdb = scopedDb(actor);
  const visibleLeadCenters = getModelVisibleCenterIds("Lead", actor);
  const leadTaskScope =
    visibleLeadCenters === "ALL" ? {} : { lead: { centerId: { in: visibleLeadCenters } } };
  const [openTasks, trials] = await Promise.all([
    sdb.leadTask.findMany({
      where: { assignedToId: userId, status: "OPEN", ...leadTaskScope },
      orderBy: { dueAt: "asc" },
      take: 50,
      select: { id: true, title: true, dueAt: true, leadId: true },
    }),
    sdb.trialClass.findMany({
      where: {
        lead: { assignedToId: userId },
        scheduledAt: { gte: dayStart },
        status: { in: ["SCHEDULED", "CONFIRMED", "POSTPONED"] },
      },
      orderBy: { scheduledAt: "asc" },
      take: 6,
      select: { id: true, scheduledAt: true, lead: { select: { id: true, parentName: true, childName: true } } },
    }),
  ]);
  const overdue = openTasks.filter((t) => t.dueAt < now);
  const dueToday = openTasks.filter((t) => t.dueAt >= now && t.dueAt < dayEnd);

  // REQ-04: cache số liệu tổng hợp theo USER (userId), TTL 60s.
  const { totalMine, enrolledMonth, closeRate, countByStatus, weeklyBars, nearingEndCount } =
    await safeCache(
      () => getSalesStats(userId),
      ["sales-dashboard-stats", userId],
      { tags: [CACHE_TAGS.dashboard], revalidate: 60 },
    )();

  return (
    <div className="space-y-6">
      {!embedded && <h1 className="text-2xl font-bold text-foreground">Chào {name || "bạn"} 👋</h1>}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <DashStat label="Lead của tôi" value={totalMine} href="/leads" icon={<Users className="h-5 w-5" />} />
        <DashStat label="Chốt tháng này" value={enrolledMonth} href="/leads" tone="ok" icon={<TrendingUp className="h-5 w-5" />} />
        <DashStat label="Tỷ lệ chốt" value={`${closeRate}%`} href="/leads" icon={<TrendingUp className="h-5 w-5" />} />
        <DashStat label="Việc quá hạn" value={overdue.length} href="/leads?view=kanban" tone={overdue.length > 0 ? "danger" : "ok"} icon={<CheckSquare className="h-5 w-5" />} />
      </div>

      {nearingEndCount > 0 && (
        <Link
          href="/students/sap-het-khoa"
          className="flex items-center gap-2 rounded-xl border border-state-warning-soft bg-state-warning-soft p-3 text-sm text-state-warning-ink hover:border-state-warning"
        >
          <GraduationCap className="h-5 w-5 shrink-0" />
          <span>
            <b>{nearingEndCount}</b> học viên sắp hết khoá (≤ 5 buổi) — nhắc phụ huynh tái tục.
          </span>
        </Link>
      )}

      {/* Pipeline của tôi */}
      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-muted-foreground">Lead của tôi theo giai đoạn</h2>
        <div className="flex flex-wrap gap-2">
          {KANBAN_COLUMNS.map((s) => (
            <Link key={s} href={`/leads?status=${s}`} className={`rounded-lg px-3 py-1.5 text-sm font-medium ${LEAD_STATUS_BADGE[s]}`}>
              {LEAD_STATUS_LABEL[s]}: <strong>{countByStatus[s] ?? 0}</strong>
            </Link>
          ))}
        </div>
      </section>

      {/* Phễu lead theo TUẦN — lead của tôi: mới vs chuyển đổi (8 tuần gần nhất). */}
      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="mb-1 text-sm font-bold uppercase tracking-wider text-muted-foreground">Phễu lead theo tuần</h2>
        <p className="mb-4 text-xs text-muted-foreground">Lead mới vs đã chuyển đổi mỗi tuần (8 tuần gần nhất)</p>
        <BarChart
          data={weeklyBars}
          xKey="week"
          bars={[
            { key: "total", name: "Lead mới", color: "#F97316" },
            { key: "converted", name: "Chuyển đổi", color: "#7C3AED" },
          ]}
          height={240}
        />
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Việc cần làm */}
        <section className="rounded-xl border border-border bg-card p-5">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-muted-foreground">
            Việc cần làm ({overdue.length} quá hạn · {dueToday.length} hôm nay)
          </h2>
          {overdue.length + dueToday.length === 0 ? (
            <p className="text-sm text-muted-foreground">Không có việc đến hạn.</p>
          ) : (
            <ul className="space-y-1.5 text-sm">
              {[...overdue, ...dueToday].slice(0, 8).map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-2">
                  <Link href={`/leads/${t.leadId}`} className="truncate font-medium text-foreground hover:text-primary">{t.title}</Link>
                  <span className={`shrink-0 text-xs ${t.dueAt < now ? "font-semibold text-state-danger-ink" : "text-muted-foreground"}`}>
                    {formatDateVN(t.dueAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Học thử sắp tới */}
        <section className="rounded-xl border border-border bg-card p-5">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-muted-foreground">
            <FlaskConical className="h-4 w-4" /> Học thử sắp tới
          </h2>
          {trials.length === 0 ? (
            <p className="text-sm text-muted-foreground">Chưa có buổi học thử nào.</p>
          ) : (
            <ul className="space-y-1.5 text-sm">
              {trials.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-2">
                  <Link href={`/leads/${t.lead.id}`} className="truncate font-medium text-foreground hover:text-primary">
                    {t.lead.childName ?? t.lead.parentName}
                  </Link>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {new Date(t.scheduledAt).toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function DashStat({
  label, value, href, tone = "neutral", icon,
}: {
  label: string; value: number | string; href: string; tone?: "neutral" | "ok" | "danger"; icon: React.ReactNode;
}) {
  const toneCls = tone === "danger" ? "text-state-danger-ink" : tone === "ok" ? "text-state-success-ink" : "text-primary";
  return (
    <Link href={href} className="rounded-xl border border-border bg-card p-4 hover:border-primary">
      <div className={`flex items-center gap-2 ${toneCls}`}>{icon}<span className="text-2xl font-bold tabular-nums">{value}</span></div>
      <div className="mt-1 text-xs text-muted-foreground">{label}</div>
    </Link>
  );
}
