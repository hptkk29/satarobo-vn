import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { Users, UserPlus, BookOpen, FileText, TrendingUp } from "lucide-react";
import { StatCardAdmin } from "@/components/design-system/admin/stat-card-admin";
import { StatusBadge } from "@/components/design-system/admin/status-badge";
import { DataTableShell } from "@/components/design-system/admin/data-table-shell";
import { LineChart } from "@/components/charts/line-chart";
import { BarChart } from "@/components/charts/bar-chart";

const STATUS_VARIANT: Record<
  string,
  "success" | "warning" | "error" | "info" | "neutral"
> = {
  NEW: "info",
  ASSIGNED: "info",
  CONTACTED: "warning",
  NO_ANSWER: "warning",
  CONSULTING: "info",
  TRIAL_SCHEDULED: "info",
  TRIAL_ATTENDED: "info",
  AWAITING_DECISION: "warning",
  DEMO_SCHEDULED: "info",
  ENROLLED: "success",
  NURTURING: "warning",
  LOST: "error",
  DUPLICATE: "neutral",
};

const STATUS_LABELS: Record<string, string> = {
  NEW: "Mới",
  ASSIGNED: "Đã phân công",
  CONTACTED: "Đã liên hệ",
  NO_ANSWER: "Không nghe máy",
  CONSULTING: "Đang tư vấn",
  TRIAL_SCHEDULED: "Đã hẹn học thử",
  TRIAL_ATTENDED: "Đã học thử",
  AWAITING_DECISION: "Chờ quyết định",
  DEMO_SCHEDULED: "Đã hẹn demo",
  ENROLLED: "Đã đăng ký",
  NURTURING: "Đang nuôi",
  LOST: "Đã mất",
  DUPLICATE: "Trùng lặp",
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
    const key = new Date(l.createdAt).toLocaleDateString("vi-VN", {
      day: "2-digit",
      month: "2-digit",
    });
    if (key in buckets) buckets[key]++;
  });
  return Object.entries(buckets).map(([date, count]) => ({ date, leads: count }));
}

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
  const endOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    23,
    59,
    59,
  );

  const [
    totalLeads,
    newLeadsThisMonth,
    newLeadsLastMonth,
    enrolledLeads,
    totalStudents,
    totalPosts,
    recentLeads,
    leadsLast14Days,
    leadsByStatus,
    myTasksToday,
  ] = await Promise.all([
    db.lead.count({ where: ACTIVE_LEAD }),
    db.lead.count({
      where: { ...ACTIVE_LEAD, createdAt: { gte: monthStart } },
    }),
    db.lead.count({
      where: {
        ...ACTIVE_LEAD,
        createdAt: { gte: lastMonth, lt: monthStart },
      },
    }),
    db.lead.count({ where: { ...ACTIVE_LEAD, status: "ENROLLED" } }),
    db.student.count({ where: { deletedAt: null } }),
    db.news.count({ where: { isPublished: true } }),
    db.lead.findMany({
      where: ACTIVE_LEAD,
      take: 8,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        parentName: true,
        phone: true,
        status: true,
        createdAt: true,
      },
    }),
    db.lead.findMany({
      where: { ...ACTIVE_LEAD, createdAt: { gte: fourteenDaysAgo } },
      select: { createdAt: true },
    }),
    db.lead.groupBy({
      by: ["status"],
      where: ACTIVE_LEAD,
      _count: { id: true },
    }),
    // Phase T1.2 — "Việc hôm nay": task OPEN của mình, hạn <= hết hôm nay.
    db.leadTask.findMany({
      where: {
        assignedToId: session.user.id,
        status: "OPEN",
        dueAt: { lte: endOfToday },
      },
      include: {
        lead: { select: { id: true, parentName: true, phone: true } },
      },
      orderBy: { dueAt: "asc" },
      take: 20,
    }),
  ]);

  const monthDelta =
    newLeadsLastMonth > 0
      ? ((newLeadsThisMonth - newLeadsLastMonth) / newLeadsLastMonth) * 100
      : 0;
  const conversionRate =
    totalLeads > 0 ? ((enrolledLeads / totalLeads) * 100).toFixed(1) : "0";

  const dailyLeadsChart = lastNDaysData(leadsLast14Days);
  const statusBars = leadsByStatus
    .map((s) => ({
      status: STATUS_LABELS[s.status] ?? s.status,
      count: s._count.id,
    }))
    .sort((a, b) => b.count - a.count);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-neutral-900">
          Xin chào, {session.user.name?.split(" ").slice(-1)[0] ?? "Admin"}
        </h1>
        <p className="text-sm text-neutral-500 mt-1">
          Tổng quan hệ thống ·{" "}
          {now.toLocaleDateString("vi-VN", {
            weekday: "long",
            day: "numeric",
            month: "long",
          })}
        </p>
      </div>

      {myTasksToday.length > 0 && (
        <div className="rounded-xl border border-orange-200 bg-orange-50 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-bold text-orange-800">
              Việc hôm nay ({myTasksToday.length})
            </h2>
            <Link href="/leads?view=kanban" className="text-xs text-orange-700 hover:underline">
              Xem pipeline →
            </Link>
          </div>
          <ul className="space-y-2">
            {myTasksToday.map((t) => {
              const overdue = t.dueAt.getTime() < now.getTime();
              return (
                <li key={t.id}>
                  <Link
                    href={`/leads/${t.lead.id}`}
                    className="flex items-center justify-between gap-3 rounded-lg bg-white px-3 py-2 text-sm hover:bg-orange-100/40"
                  >
                    <span className="min-w-0 flex-1 truncate">
                      <strong className="text-gray-900">{t.title}</strong>
                      <span className="text-gray-500"> · {t.lead.parentName}</span>
                    </span>
                    <span
                      className={`flex-shrink-0 text-xs ${overdue ? "font-bold text-red-600" : "text-gray-500"}`}
                    >
                      {t.dueAt.toLocaleTimeString("vi-VN", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                      {overdue ? " · Quá hạn" : ""}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCardAdmin
          label="Tổng leads"
          value={totalLeads}
          icon={<Users className="w-4 h-4" />}
          iconColor="orange"
        />
        <StatCardAdmin
          label="Leads tháng này"
          value={newLeadsThisMonth}
          trend={
            monthDelta !== 0
              ? {
                  direction: monthDelta > 0 ? "up" : "down",
                  value: `${monthDelta > 0 ? "+" : ""}${monthDelta.toFixed(0)}% so với tháng trước`,
                }
              : undefined
          }
          icon={<UserPlus className="w-4 h-4" />}
          iconColor="purple"
        />
        <StatCardAdmin
          label="Học viên đăng ký"
          value={totalStudents}
          icon={<BookOpen className="w-4 h-4" />}
          iconColor="orange"
        />
        <StatCardAdmin
          label="Conversion rate"
          value={`${conversionRate}%`}
          icon={<TrendingUp className="w-4 h-4" />}
          iconColor="purple"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white border border-neutral-200 rounded-xl p-6">
          <h2 className="font-semibold text-neutral-900 mb-1">Leads 14 ngày qua</h2>
          <p className="text-xs text-neutral-500 mb-4">Số lead mới mỗi ngày</p>
          {dailyLeadsChart.length > 0 ? (
            <LineChart
              data={dailyLeadsChart}
              xKey="date"
              lines={[{ key: "leads", name: "Leads", color: "#F97316" }]}
              showLegend={false}
              height={260}
            />
          ) : (
            <div className="h-[260px] flex items-center justify-center text-sm text-neutral-400">
              Chưa có dữ liệu
            </div>
          )}
        </div>

        <div className="bg-white border border-neutral-200 rounded-xl p-6">
          <h2 className="font-semibold text-neutral-900 mb-1">
            Phân bố theo trạng thái
          </h2>
          <p className="text-xs text-neutral-500 mb-4">Tất cả leads</p>
          {statusBars.length > 0 ? (
            <BarChart
              data={statusBars}
              xKey="status"
              bars={[{ key: "count", name: "Số lượng", color: "#F97316" }]}
              height={260}
            />
          ) : (
            <div className="h-[260px] flex items-center justify-center text-sm text-neutral-400">
              Chưa có dữ liệu
            </div>
          )}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-neutral-900">Leads mới nhất</h2>
          <Link
            href="/leads"
            className="text-sm font-semibold text-orange-600 hover:underline"
          >
            Xem tất cả →
          </Link>
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
                  <td className="px-4 py-3 font-medium text-neutral-900">
                    {lead.parentName}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-neutral-700">
                    {lead.phone.replace(/(\d{4})(\d{3})(\d+)/, "$1xxx$3")}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge variant={STATUS_VARIANT[lead.status] ?? "neutral"}>
                      {STATUS_LABELS[lead.status] ?? lead.status}
                    </StatusBadge>
                  </td>
                  <td className="px-4 py-3 text-right text-xs text-neutral-500">
                    {new Date(lead.createdAt).toLocaleString("vi-VN", {
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                </tr>
              ))}
              {recentLeads.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-12 text-center text-neutral-500">
                    Chưa có lead nào
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </DataTableShell>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
        <div className="bg-white border border-neutral-200 rounded-xl p-4 flex items-center gap-3">
          <FileText className="w-5 h-5 text-orange-500 shrink-0" />
          <div>
            <p className="text-neutral-600">Tin tức đang publish</p>
            <p className="font-semibold text-neutral-900">{totalPosts} bài</p>
          </div>
        </div>
        <div className="bg-white border border-neutral-200 rounded-xl p-4 flex items-center gap-3">
          <Users className="w-5 h-5 text-purple-700 shrink-0" />
          <div>
            <p className="text-neutral-600">Leads ENROLLED tất cả</p>
            <p className="font-semibold text-neutral-900">{enrolledLeads} người</p>
          </div>
        </div>
      </div>
    </div>
  );
}
