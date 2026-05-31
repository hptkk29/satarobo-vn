import { redirect } from "next/navigation";
import Link from "next/link";
import { Users, CheckCircle2, Percent, Loader2 } from "lucide-react";
import { auth } from "@/lib/auth";
import { can } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import type { LeadStatus } from "@prisma/client";
import { StatCardAdmin } from "@/components/design-system/admin/stat-card-admin";
import { FunnelChart } from "@/components/charts/funnel-chart";
import { BarChart } from "@/components/charts/bar-chart";
import { LEAD_STATUS_LABEL } from "@/lib/leads/status";

export const metadata = { title: "CRM Dashboard | Admin" };
export const dynamic = "force-dynamic";

const TERMINAL: LeadStatus[] = ["ENROLLED", "LOST", "DUPLICATE"];

// Gom status thành các bậc phễu chuyển đổi.
const FUNNEL_STAGES: { name: string; statuses: LeadStatus[] }[] = [
  { name: "Lead mới", statuses: ["NEW", "ASSIGNED"] },
  {
    name: "Đã liên hệ",
    statuses: ["CONTACTED", "CONSULTING", "NO_ANSWER", "NURTURING"],
  },
  {
    name: "Học thử",
    statuses: ["TRIAL_SCHEDULED", "TRIAL_ATTENDED", "DEMO_SCHEDULED"],
  },
  { name: "Chờ quyết định", statuses: ["AWAITING_DECISION"] },
  { name: "Đã chốt", statuses: ["ENROLLED"] },
];

export default async function CrmDashboardPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!can(session.user, "leads:view-all")) redirect("/dashboard");

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [byStatus, bySource, byAssigned, enrolledByAssigned, sales, monthTotal, monthEnrolled] =
    await Promise.all([
      db.lead.groupBy({
        by: ["status"],
        where: { deletedAt: null },
        _count: { _all: true },
      }),
      db.lead.groupBy({
        by: ["source"],
        where: { deletedAt: null },
        _count: { _all: true },
      }),
      db.lead.groupBy({
        by: ["assignedToId"],
        where: { deletedAt: null, assignedToId: { not: null } },
        _count: { _all: true },
      }),
      db.lead.groupBy({
        by: ["assignedToId"],
        where: { deletedAt: null, assignedToId: { not: null }, status: "ENROLLED" },
        _count: { _all: true },
      }),
      db.user.findMany({
        where: { roles: { has: "SALES_CSM" }, isActive: true, deletedAt: null },
        select: { id: true, name: true, email: true },
        orderBy: { name: "asc" },
      }),
      db.lead.count({ where: { deletedAt: null, createdAt: { gte: monthStart } } }),
      db.lead.count({
        where: { deletedAt: null, status: "ENROLLED", updatedAt: { gte: monthStart } },
      }),
    ]);

  const statusCount = new Map<string, number>();
  let total = 0;
  let nonDuplicate = 0;
  let open = 0;
  let enrolledTotal = 0;
  for (const g of byStatus) {
    const c = g._count._all;
    statusCount.set(g.status, c);
    total += c;
    if (g.status !== "DUPLICATE") nonDuplicate += c;
    if (!TERMINAL.includes(g.status)) open += c;
    if (g.status === "ENROLLED") enrolledTotal += c;
  }

  const conversion =
    nonDuplicate > 0 ? (enrolledTotal / nonDuplicate) * 100 : 0;

  const funnelData = FUNNEL_STAGES.map((stage) => ({
    name: stage.name,
    value: stage.statuses.reduce((sum, s) => sum + (statusCount.get(s) ?? 0), 0),
  }));

  const sourceData = bySource
    .map((g) => ({ source: g.source ?? "Không rõ", count: g._count._all }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  const assignedMap = new Map(
    byAssigned.map((g) => [g.assignedToId, g._count._all]),
  );
  const enrolledMap = new Map(
    enrolledByAssigned.map((g) => [g.assignedToId, g._count._all]),
  );
  const salesRows = sales
    .map((u) => {
      const assigned = assignedMap.get(u.id) ?? 0;
      const enrolled = enrolledMap.get(u.id) ?? 0;
      return {
        id: u.id,
        name: u.name ?? u.email,
        assigned,
        enrolled,
        rate: assigned > 0 ? (enrolled / assigned) * 100 : 0,
      };
    })
    .sort((a, b) => b.enrolled - a.enrolled);

  return (
    <div className="max-w-6xl p-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">CRM Dashboard</h1>
          <p className="mt-1 text-sm text-gray-500">
            Phễu chuyển đổi lead & hiệu suất đội sale.
          </p>
        </div>
        <Link
          href="/leads?view=kanban"
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Mở Kanban Leads →
        </Link>
      </div>

      {/* KPI cards */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCardAdmin
          label="Lead tháng này"
          value={monthTotal}
          icon={<Users className="h-5 w-5" />}
        />
        <StatCardAdmin
          label="Đang xử lý"
          value={open}
          icon={<Loader2 className="h-5 w-5" />}
          iconColor="neutral"
        />
        <StatCardAdmin
          label="Chốt tháng này"
          value={monthEnrolled}
          icon={<CheckCircle2 className="h-5 w-5" />}
          iconColor="purple"
        />
        <StatCardAdmin
          label="Tỉ lệ chuyển đổi"
          value={`${conversion.toFixed(1)}%`}
          icon={<Percent className="h-5 w-5" />}
          iconColor="purple"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Funnel */}
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <h2 className="mb-2 text-sm font-semibold text-gray-700">
            Phễu chuyển đổi
          </h2>
          {total === 0 ? (
            <EmptyChart />
          ) : (
            <FunnelChart data={funnelData} height={300} />
          )}
        </div>

        {/* Source */}
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <h2 className="mb-2 text-sm font-semibold text-gray-700">
            Lead theo nguồn
          </h2>
          {sourceData.length === 0 ? (
            <EmptyChart />
          ) : (
            <BarChart
              data={sourceData}
              xKey="source"
              bars={[{ key: "count", name: "Số lead" }]}
              height={300}
            />
          )}
        </div>
      </div>

      {/* Sale performance */}
      <div className="mt-6 rounded-xl border border-gray-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-gray-700">
          Hiệu suất đội sale
        </h2>
        {salesRows.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-400">
            Chưa có nhân viên SALES_CSM.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-400">
                  <th className="py-2 pr-4 font-semibold">Nhân viên</th>
                  <th className="py-2 pr-4 font-semibold">Lead được giao</th>
                  <th className="py-2 pr-4 font-semibold">Đã chốt</th>
                  <th className="py-2 font-semibold">Tỉ lệ chốt</th>
                </tr>
              </thead>
              <tbody>
                {salesRows.map((r) => (
                  <tr key={r.id} className="border-b border-gray-50">
                    <td className="py-2 pr-4 font-medium text-gray-800">
                      {r.name}
                    </td>
                    <td className="py-2 pr-4 text-gray-700">{r.assigned}</td>
                    <td className="py-2 pr-4 text-gray-700">{r.enrolled}</td>
                    <td className="py-2 text-gray-700">{r.rate.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Status breakdown chips */}
      <div className="mt-6 rounded-xl border border-gray-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-gray-700">
          Chi tiết theo trạng thái
        </h2>
        <div className="flex flex-wrap gap-2">
          {[...statusCount.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([status, count]) => (
              <span
                key={status}
                className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700"
              >
                {LEAD_STATUS_LABEL[status as LeadStatus] ?? status}: {count}
              </span>
            ))}
        </div>
      </div>
    </div>
  );
}

function EmptyChart() {
  return (
    <div className="flex h-[300px] items-center justify-center text-sm text-gray-400">
      Chưa có dữ liệu.
    </div>
  );
}
