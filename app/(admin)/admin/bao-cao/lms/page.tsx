import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { can } from "@/lib/auth/permissions";
import { resolveActor } from "@/lib/auth/actor";
import { BarChart } from "@/components/charts/bar-chart";
import { LineChart } from "@/components/charts/line-chart";
import { getLmsReports } from "@/lib/reports/lms-extra-queries";

export const metadata = { title: "Báo cáo LMS | Admin" };
export const dynamic = "force-dynamic";

const vnd = (n: number) => `${Math.round(n).toLocaleString("vi-VN")} đ`;

function Stat({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "neutral" | "good" | "bad" }) {
  const c = tone === "good" ? "text-emerald-700" : tone === "bad" ? "text-rose-700" : "text-neutral-900";
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4">
      <p className="text-xs font-medium text-neutral-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${c}`}>{value}</p>
    </div>
  );
}

export default async function LmsReportPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!can(session.user, "payments:manage")) redirect("/dashboard");

  const actor = await resolveActor(session.user.id);
  const r = await getLmsReports(actor);

  const teacherData = r.teacherPerformance.map((t) => ({
    teacher: t.teacherName,
    sessions: t.sessionsCompleted,
    students: t.students,
  }));
  const cohortData = r.cohort.map((c) => ({ cohort: c.cohort, progress: c.avgProgress, active: c.activeRate }));
  const revenueData = r.revenueVsTarget.map((x) => ({ period: x.period, revenue: x.revenue, target: x.target }));

  return (
    <div className="space-y-6 p-4">
      <h1 className="text-xl font-semibold">Báo cáo LMS</h1>

      {/* Churn / drop-off */}
      <section>
        <h2 className="mb-2 text-sm font-medium text-neutral-600">Churn / Vòng đời ghi danh</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Tỉ lệ rút/hủy" value={`${r.churn.churnRate}%`} tone={r.churn.churnRate > 20 ? "bad" : "neutral"} />
          <Stat label="Đang học" value={String(r.churn.active)} tone="good" />
          <Stat label="Hoàn thành" value={String(r.churn.completed)} />
          <Stat label="Rút/hủy" value={String(r.churn.churned)} tone={r.churn.churned > 0 ? "bad" : "neutral"} />
        </div>
      </section>

      {/* Hiệu suất GV */}
      <section>
        <h2 className="mb-2 text-sm font-medium text-neutral-600">Hiệu suất giáo viên</h2>
        {teacherData.length ? (
          <>
            <BarChart
              data={teacherData}
              xKey="teacher"
              bars={[
                { key: "sessions", name: "Buổi đã dạy", color: "#F97316" },
                { key: "students", name: "Học viên", color: "#7C3AED" },
              ]}
            />
            <table className="mt-3 w-full text-sm">
              <thead>
                <tr className="border-b text-left text-neutral-500">
                  <th className="py-1">GV</th>
                  <th className="py-1">Lớp</th>
                  <th className="py-1">Chuyên cần</th>
                  <th className="py-1">Điểm TB</th>
                </tr>
              </thead>
              <tbody>
                {r.teacherPerformance.map((t) => (
                  <tr key={t.teacherId} className="border-b">
                    <td className="py-1">{t.teacherName}</td>
                    <td className="py-1">{t.classes}</td>
                    <td className="py-1">{t.attendanceRate}%</td>
                    <td className="py-1">{t.avgExamScore ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        ) : (
          <p className="text-sm text-neutral-400">Chưa có dữ liệu.</p>
        )}
      </section>

      {/* Cohort tiến độ */}
      <section>
        <h2 className="mb-2 text-sm font-medium text-neutral-600">Tiến độ theo cohort (tháng bắt đầu)</h2>
        {cohortData.length ? (
          <BarChart
            data={cohortData}
            xKey="cohort"
            bars={[
              { key: "progress", name: "Tiến độ TB %", color: "#F97316" },
              { key: "active", name: "Còn học %", color: "#10B981" },
            ]}
          />
        ) : (
          <p className="text-sm text-neutral-400">Chưa có dữ liệu.</p>
        )}
      </section>

      {/* Doanh thu vs mục tiêu */}
      <section>
        <h2 className="mb-2 text-sm font-medium text-neutral-600">Doanh thu vs mục tiêu</h2>
        {revenueData.length ? (
          <>
            <LineChart
              data={revenueData}
              xKey="period"
              lines={[
                { key: "revenue", name: "Thực thu", color: "#F97316" },
                { key: "target", name: "Mục tiêu", color: "#9CA3AF" },
              ]}
            />
            <p className="mt-1 text-xs text-neutral-400">
              Tổng thực thu: {vnd(revenueData.reduce((s, x) => s + x.revenue, 0))}
            </p>
          </>
        ) : (
          <p className="text-sm text-neutral-400">Chưa có dữ liệu (cấu hình mục tiêu qua RevenueTarget).</p>
        )}
      </section>
    </div>
  );
}
