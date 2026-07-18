import Link from "next/link";
import { unstable_cache } from "next/cache";
import { Users, UserPlus, BookOpen, FileText, TrendingUp, Target, FlaskConical, GraduationCap, Wallet } from "lucide-react";
import { scopedDb } from "@/lib/db-scope";
import type { Actor } from "@/lib/auth/actor";
import { CACHE_TAGS } from "@/lib/cache/tags";
import { actorScopeKey } from "@/lib/cache/scope-key";
import { StatCardAdmin } from "@/components/design-system/admin/stat-card-admin";
import { StatusBadge } from "@/components/design-system/admin/status-badge";
import { DataTableShell } from "@/components/design-system/admin/data-table-shell";
import { LineChart } from "@/components/charts/line-chart";
import { BarChart } from "@/components/charts/bar-chart";
import { groupByWeek, monthKeyVN, type LeadReportRecord } from "@/lib/reports/lead";
import { buildRevenueTargetReport, computeAchievement } from "@/lib/reports/revenue-target";
import { getRevenueTargets } from "@/lib/reports/revenue-target-data";
import { getDebtRows } from "@/lib/finance/debt";

const vnd = (n: number) => `${n.toLocaleString("vi-VN")}đ`;
const TRIAL_ACTIVE_STATUSES = ["SCHEDULED", "CONFIRMED", "POSTPONED"] as const;

// Đợt 3C #4 / 3B — Dashboard QUẢN LÝ + SUPER_ADMIN (tổng quan tuyển sinh + vận hành).
// BỐ CỤC GỌN (commit 1): KPI → biểu đồ → hoạt động gần đây. Các thẻ "việc tồn đọng"
// (lớp chờ duyệt, buổi chưa hoàn tất, ảnh/yêu cầu chờ duyệt, checklist cơ sở) ĐÃ gom
// ở khu "Cần xử lý" (PendingTasksSection) cấp trang → KHÔNG lặp lại tại đây.
// centerScope: != null → giới hạn cơ sở (CENTER_MANAGER không kèm SUPER_ADMIN).

const STATUS_VARIANT: Record<string, "success" | "warning" | "error" | "info" | "neutral"> = {
  NEW: "info", ASSIGNED: "info", CONTACTED: "warning", NO_ANSWER: "warning",
  CONSULTING: "info", TRIAL_SCHEDULED: "info", TRIAL_ATTENDED: "info",
  AWAITING_DECISION: "warning", DEMO_SCHEDULED: "info", ENROLLED: "success",
  NURTURING: "warning", LOST: "error", DUPLICATE: "neutral",
};
const STATUS_LABELS: Record<string, string> = {
  NEW: "Mới", ASSIGNED: "Đã phân công", CONTACTED: "Đã liên hệ", NO_ANSWER: "Không nghe máy",
  CONSULTING: "Đang tư vấn", TRIAL_SCHEDULED: "Đã hẹn học thử", TRIAL_ATTENDED: "Đã học thử",
  AWAITING_DECISION: "Chờ quyết định", DEMO_SCHEDULED: "Đã hẹn demo", ENROLLED: "Đã đăng ký",
  NURTURING: "Đang nuôi", LOST: "Đã mất", DUPLICATE: "Trùng lặp",
};
const ACTIVE_LEAD: { deletedAt: null } = { deletedAt: null };

function lastNDaysData(leads: { createdAt: Date }[], days = 14) {
  const buckets: Record<string, number> = {};
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" });
    buckets[key] = 0;
  }
  leads.forEach((l) => {
    const key = new Date(l.createdAt).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" });
    if (key in buckets) buckets[key]++;
  });
  return Object.entries(buckets).map(([date, count]) => ({ date, leads: count }));
}

// REQ-04: số liệu tổng hợp dashboard quản lý (aggregate theo scope, KHÔNG list per-user).
// Tự tính `now` bên trong → sau khi cache hết hạn (TTL) tự làm mới mốc thời gian. Output
// toàn PRIMITIVE (số + mảng {string,number}) → serialize qua unstable_cache an toàn.
async function getManagerStats(actor: Actor) {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);
  const eightWeeksAgo = new Date(now.getTime() - 8 * 7 * 86_400_000);
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);
  const currentPeriod = monthKeyVN(now);

  // FL0 — cách ly cơ sở: Lead/Student/Payment/TrialClass(V2)/ClassSession ∈ SCOPED_MODELS
  // → scopedDb lọc theo tầm nhìn cơ sở. News không scoped → đi qua nguyên vẹn.
  // RevenueTarget ∈ SCOPE_EXEMPT → scope TAY qua getRevenueTargets(actor).
  const sdb = scopedDb(actor);
  const [
    totalLeads, newLeadsThisMonth, newLeadsLastMonth, enrolledLeads, totalStudents,
    totalPosts, leadsLast14Days, leadsByStatus, leadsForWeekly, revenuePayments,
    revenueTargets, trialsLegacyToday, trialV2Classes, sessionsToday, debtRows,
  ] = await Promise.all([
    sdb.lead.count({ where: ACTIVE_LEAD }),
    sdb.lead.count({ where: { ...ACTIVE_LEAD, createdAt: { gte: monthStart } } }),
    sdb.lead.count({ where: { ...ACTIVE_LEAD, createdAt: { gte: lastMonth, lt: monthStart } } }),
    sdb.lead.count({ where: { ...ACTIVE_LEAD, status: "ENROLLED" } }),
    sdb.student.count({ where: { deletedAt: null } }),
    sdb.news.count({ where: { isPublished: true } }),
    sdb.lead.findMany({ where: { ...ACTIVE_LEAD, createdAt: { gte: fourteenDaysAgo } }, select: { createdAt: true } }),
    sdb.lead.groupBy({ by: ["status"], where: ACTIVE_LEAD, _count: { id: true } }),
    // Phễu lead theo TUẦN (8 tuần) — chỉ cần createdAt + status.
    sdb.lead.findMany({ where: { ...ACTIVE_LEAD, createdAt: { gte: eightWeeksAgo } }, select: { createdAt: true, status: true } }),
    // Doanh thu THỰC = Σ Payment(accountantStatus=CONFIRMED) — 6 tháng gần nhất.
    sdb.payment.findMany({
      where: { accountantStatus: "CONFIRMED", deletedAt: null, paidDate: { gte: sixMonthsAgo } },
      select: { amount: true, centerId: true, paidDate: true },
      take: 50_000,
    }),
    getRevenueTargets(actor),
    // Hẹn học thử HÔM NAY — TrialClass (cũ, có scheduledAt).
    sdb.trialClass.count({ where: { scheduledAt: { gte: dayStart, lt: dayEnd }, status: { in: [...TRIAL_ACTIVE_STATUSES] } } }),
    // + TrialClassV2 (R7): TrialClassSession không scoped → cách ly qua parent TrialClassV2 (SCOPED).
    sdb.trialClassV2.findMany({
      where: { sessions: { some: { date: { gte: dayStart, lt: dayEnd }, status: "SCHEDULED" } } },
      select: { sessions: { where: { date: { gte: dayStart, lt: dayEnd }, status: "SCHEDULED" }, select: { id: true } } },
    }),
    // GV đứng lớp HÔM NAY — ClassSession (SCOPED); GV thực = actualTeacherId ?? class.teacherId.
    sdb.classSession.findMany({
      where: { date: { gte: dayStart, lt: dayEnd } },
      select: { actualTeacherId: true, class: { select: { teacherId: true } } },
    }),
    // Công nợ học phí (Payment 2 tầng) — TÁI DÙNG lib getDebtRows (đã cách ly qua Class).
    getDebtRows(sdb as unknown as Parameters<typeof getDebtRows>[0]),
  ]);

  const monthDelta = newLeadsLastMonth > 0 ? ((newLeadsThisMonth - newLeadsLastMonth) / newLeadsLastMonth) * 100 : 0;
  const conversionRate = totalLeads > 0 ? ((enrolledLeads / totalLeads) * 100).toFixed(1) : "0";
  const dailyLeadsChart = lastNDaysData(leadsLast14Days);
  const statusBars = leadsByStatus.map((s) => ({ status: STATUS_LABELS[s.status] ?? s.status, count: s._count.id })).sort((a, b) => b.count - a.count);

  // câu 16 (a) — doanh thu THỰC vs MỤC TIÊU kỳ hiện tại (ghép qua helper thuần).
  const revenueReport = buildRevenueTargetReport(
    revenuePayments.map((p) => ({ amount: p.amount, centerId: p.centerId, paidDate: p.paidDate })),
    revenueTargets,
  );
  const currentRevRow = revenueReport.find((r) => r.period === currentPeriod);
  const revenueActual = currentRevRow?.actual ?? 0;
  const revenueTarget = currentRevRow?.target ?? null;
  const revenueAchieved = (currentRevRow ?? computeAchievement(revenueActual, revenueTarget)).achievedRate;

  // câu 16 (c) — hẹn học thử hôm nay (TrialClass cũ + buổi TrialClassV2 hôm nay).
  const trialsToday = trialsLegacyToday + trialV2Classes.reduce((s, c) => s + c.sessions.length, 0);

  // câu 16 (d) — số GV đứng lớp hôm nay (distinct theo GV thực).
  const teacherSet = new Set<string>();
  for (const s of sessionsToday) {
    const tid = s.actualTeacherId ?? s.class?.teacherId ?? null;
    if (tid) teacherSet.add(tid);
  }
  const teachersToday = teacherSet.size;

  // câu 16 (e) — công nợ học phí còn lại (chỉ debt > 0).
  const totalDebt = debtRows.reduce((sum, r) => sum + (r.debt > 0 ? r.debt : 0), 0);
  const debtCount = debtRows.filter((r) => r.debt > 0).length;

  // Phễu lead theo TUẦN (8 tuần gần nhất) — tổng vs chuyển đổi.
  const weeklyRecords: LeadReportRecord[] = leadsForWeekly.map((l) => ({
    status: l.status,
    source: null,
    centerId: null,
    commissionSource: null,
    createdAt: l.createdAt,
  }));
  const weeklyBars = groupByWeek(weeklyRecords, 8, now).map((w) => ({ week: w.label, total: w.total, converted: w.converted }));

  return {
    totalLeads, newLeadsThisMonth, enrolledLeads, totalStudents, totalPosts,
    monthDelta, conversionRate, dailyLeadsChart, statusBars,
    revenueActual, revenueAchieved, trialsToday, teachersToday, totalDebt, debtCount, weeklyBars,
  };
}

export async function ManagerDashboard({
  userId,
  name,
  actor,
  embedded = false,
}: {
  userId: string;
  name: string;
  actor: Actor;
  embedded?: boolean;
}) {
  const now = new Date();
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

  // Live (KHÔNG cache): leads mới nhất (hiển thị, có Date) + việc CỦA TÔI hôm nay
  // (theo userId — cache theo scope sẽ lẫn task người khác nên GIỮ live).
  const sdb = scopedDb(actor);
  const [recentLeads, myTasksToday] = await Promise.all([
    sdb.lead.findMany({ where: ACTIVE_LEAD, take: 8, orderBy: { createdAt: "desc" }, select: { id: true, parentName: true, phone: true, status: true, createdAt: true } }),
    sdb.leadTask.findMany({
      where: { assignedToId: userId, status: "OPEN", dueAt: { lte: endOfToday } },
      include: { lead: { select: { id: true, parentName: true, phone: true } } },
      orderBy: { dueAt: "asc" },
      take: 20,
    }),
  ]);

  // REQ-04: cache số liệu tổng hợp theo scope (KPI + biểu đồ, đều primitive → serialize
  // an toàn). TTL 60s. actorScopeKey chống leak cross-cơ-sở. `now` tính trong hàm cache.
  const {
    totalLeads, newLeadsThisMonth, enrolledLeads, totalStudents, totalPosts,
    monthDelta, conversionRate, dailyLeadsChart, statusBars,
    revenueActual, revenueAchieved, trialsToday, teachersToday, totalDebt, debtCount, weeklyBars,
  } = await unstable_cache(
    () => getManagerStats(actor),
    ["manager-dashboard-stats", actorScopeKey(actor)],
    { tags: [CACHE_TAGS.dashboard], revalidate: 60 },
  )();

  return (
    <div className="space-y-6">
      {!embedded && (
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">Xin chào, {name.split(" ").slice(-1)[0] || "Admin"}</h1>
          <p className="text-sm text-neutral-500 mt-1">
            Tổng quan hệ thống · {now.toLocaleDateString("vi-VN", { weekday: "long", day: "numeric", month: "long" })}
          </p>
        </div>
      )}

      {/* Việc CÁ NHÂN hôm nay (lead task của chính mình) — khác với khu "Cần xử lý"
          tổng hợp ở trên; giữ vì có giờ hẹn + thao tác nhanh. */}
      {myTasksToday.length > 0 && (
        <div className="rounded-xl border border-orange-200 bg-orange-50 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-bold text-orange-800">Việc của tôi hôm nay ({myTasksToday.length})</h2>
            <Link href="/leads?view=kanban" className="text-xs text-orange-700 hover:underline">Xem pipeline →</Link>
          </div>
          <ul className="space-y-2">
            {myTasksToday.map((t) => {
              const overdue = t.dueAt.getTime() < now.getTime();
              return (
                <li key={t.id}>
                  <Link href={`/leads/${t.lead.id}`} className="flex items-center justify-between gap-3 rounded-lg bg-white px-3 py-2 text-sm hover:bg-orange-100/40">
                    <span className="min-w-0 flex-1 truncate">
                      <strong className="text-gray-900">{t.title}</strong>
                      <span className="text-gray-500"> · {t.lead.parentName}</span>
                    </span>
                    <span className={`flex-shrink-0 text-xs ${overdue ? "font-bold text-red-600" : "text-gray-500"}`}>
                      {t.dueAt.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}{overdue ? " · Quá hạn" : ""}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* (1) KPI câu 16 — 5 chỉ số quản lý: doanh thu/mục tiêu · khách mới · học thử
          hôm nay · GV đứng lớp hôm nay · công nợ. Mọi số đã cách ly cơ sở qua scopedDb. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCardAdmin
          label="Doanh thu / mục tiêu (tháng)"
          value={vnd(revenueActual)}
          trend={
            revenueAchieved !== null
              ? { direction: revenueAchieved >= 1 ? "up" : "down", value: `${(revenueAchieved * 100).toFixed(0)}% mục tiêu` }
              : undefined
          }
          icon={<Target className="w-4 h-4" />}
          iconColor="purple"
        />
        <StatCardAdmin
          label="Khách hàng mới (tháng)"
          value={newLeadsThisMonth}
          trend={monthDelta !== 0 ? { direction: monthDelta > 0 ? "up" : "down", value: `${monthDelta > 0 ? "+" : ""}${monthDelta.toFixed(0)}% so với tháng trước` } : undefined}
          icon={<UserPlus className="w-4 h-4" />}
          iconColor="orange"
        />
        <StatCardAdmin label="Hẹn học thử hôm nay" value={trialsToday} icon={<FlaskConical className="w-4 h-4" />} iconColor="orange" />
        <StatCardAdmin label="GV đứng lớp hôm nay" value={teachersToday} icon={<GraduationCap className="w-4 h-4" />} iconColor="purple" />
        <StatCardAdmin
          label="Công nợ học phí"
          value={vnd(totalDebt)}
          trend={debtCount > 0 ? { direction: "down", value: `${debtCount} ghi danh còn nợ` } : undefined}
          icon={<Wallet className="w-4 h-4" />}
          iconColor="orange"
        />
      </div>

      {/* (1b) Chỉ số tuyển sinh phụ (giữ từ bản cũ). */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCardAdmin label="Tổng leads" value={totalLeads} icon={<Users className="w-4 h-4" />} iconColor="orange" />
        {/* BUG-009: nhãn rõ — đếm bảng Student (khác "Leads ENROLLED" đếm bảng Lead). */}
        <StatCardAdmin label="Tổng học viên" value={totalStudents} icon={<BookOpen className="w-4 h-4" />} iconColor="purple" />
        <StatCardAdmin label="Tỉ lệ chuyển đổi (lead)" value={`${conversionRate}%`} icon={<TrendingUp className="w-4 h-4" />} iconColor="orange" />
      </div>

      {/* (2) Biểu đồ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white border border-neutral-200 rounded-xl p-6">
          <h2 className="font-semibold text-neutral-900 mb-1">Leads 14 ngày qua</h2>
          <p className="text-xs text-neutral-500 mb-4">Số lead mới mỗi ngày</p>
          {dailyLeadsChart.length > 0 ? (
            <LineChart data={dailyLeadsChart} xKey="date" lines={[{ key: "leads", name: "Leads", color: "#F97316" }]} showLegend={false} height={260} />
          ) : (
            <div className="h-[260px] flex items-center justify-center text-sm text-neutral-400">Chưa có dữ liệu</div>
          )}
        </div>
        <div className="bg-white border border-neutral-200 rounded-xl p-6">
          <h2 className="font-semibold text-neutral-900 mb-1">Phân bố theo trạng thái</h2>
          <p className="text-xs text-neutral-500 mb-4">Tất cả leads</p>
          {statusBars.length > 0 ? (
            <BarChart data={statusBars} xKey="status" bars={[{ key: "count", name: "Số lượng", color: "#F97316" }]} height={260} />
          ) : (
            <div className="h-[260px] flex items-center justify-center text-sm text-neutral-400">Chưa có dữ liệu</div>
          )}
        </div>
      </div>

      {/* (2b) Phễu lead theo TUẦN — tổng vs chuyển đổi (REGISTERED/ENROLLED), 8 tuần gần nhất. */}
      <div className="bg-white border border-neutral-200 rounded-xl p-6">
        <h2 className="font-semibold text-neutral-900 mb-1">Phễu lead theo tuần</h2>
        <p className="text-xs text-neutral-500 mb-4">Lead mới vs đã chuyển đổi mỗi tuần (8 tuần gần nhất)</p>
        <BarChart
          data={weeklyBars}
          xKey="week"
          bars={[
            { key: "total", name: "Lead mới", color: "#F97316" },
            { key: "converted", name: "Chuyển đổi", color: "#7C3AED" },
          ]}
          height={260}
        />
      </div>

      {/* (3) Hoạt động gần đây */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-neutral-900">Leads mới nhất</h2>
          <Link href="/leads" className="text-sm font-semibold text-orange-600 hover:underline">Xem tất cả →</Link>
        </div>
        <DataTableShell>
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wider text-neutral-500">
              <tr>
                <th className="px-4 py-3">Phụ huynh</th>
                <th className="px-4 py-3">Phone</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Thời gian</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {recentLeads.map((lead) => (
                <tr key={lead.id} className="hover:bg-neutral-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-neutral-900">{lead.parentName}</td>
                  <td className="px-4 py-3 font-mono text-xs text-neutral-700">{lead.phone.replace(/(\d{4})(\d{3})(\d+)/, "$1xxx$3")}</td>
                  <td className="px-4 py-3">
                    <StatusBadge variant={STATUS_VARIANT[lead.status] ?? "neutral"}>{STATUS_LABELS[lead.status] ?? lead.status}</StatusBadge>
                  </td>
                  <td className="px-4 py-3 text-right text-xs text-neutral-500">
                    {new Date(lead.createdAt).toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                  </td>
                </tr>
              ))}
              {recentLeads.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-12 text-center text-neutral-500">Chưa có lead nào</td></tr>
              )}
            </tbody>
          </table>
        </DataTableShell>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
        <div className="bg-white border border-neutral-200 rounded-xl p-4 flex items-center gap-3">
          <FileText className="w-5 h-5 text-orange-500 shrink-0" />
          <div><p className="text-neutral-600">Tin tức đang publish</p><p className="font-semibold text-neutral-900">{totalPosts} bài</p></div>
        </div>
        <div className="bg-white border border-neutral-200 rounded-xl p-4 flex items-center gap-3">
          <Users className="w-5 h-5 text-purple-700 shrink-0" />
          <div><p className="text-neutral-600">Leads ENROLLED tất cả</p><p className="font-semibold text-neutral-900">{enrolledLeads} người</p></div>
        </div>
      </div>
    </div>
  );
}
