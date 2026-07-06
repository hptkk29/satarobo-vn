import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/auth/check-permission";
import { resolveActor } from "@/lib/auth/actor";
import { scopedDb } from "@/lib/db-scope";
import { buildChurnReport, type ChurnEnrollmentRecord } from "@/lib/reports/churn";
import { BarChart } from "@/components/charts/bar-chart";
import { LineChart } from "@/components/charts/line-chart";

export const metadata = { title: "Báo cáo churn / rời lớp | Admin" };
export const dynamic = "force-dynamic";

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
const num = (n: number) => n.toLocaleString("vi-VN");

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

export default async function ChurnReportPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!(await checkPermission("enrollments:view-all"))) {
    redirect("/dashboard?error=unauthorized");
  }

  const actor = await resolveActor(session.user.id);
  const sdb = scopedDb(actor);

  // Class LÀ model scoped → trả về CHỈ lớp trong tầm nhìn cơ sở. Enrollment KHÔNG
  // có centerId (không auto-scope) → cách ly bằng cách giới hạn theo classId của
  // các lớp đã scoped + suy centerId từ map class→center (AC: cách ly cơ sở).
  const classes = await sdb.class.findMany({ select: { id: true, centerId: true } });
  const classIds = classes.map((c) => c.id);
  const classCenter = new Map(classes.map((c) => [c.id, c.centerId]));

  const [enrollments, centers] = await Promise.all([
    classIds.length
      ? sdb.enrollment.findMany({
          where: { classId: { in: classIds }, deletedAt: null },
          select: {
            status: true,
            classId: true,
            startedAt: true,
            enrolledAt: true,
            endedAt: true,
          },
          take: 50_000,
        })
      : Promise.resolve([]),
    sdb.center.findMany({ select: { id: true, name: true } }),
  ]);

  const centerNames = Object.fromEntries(centers.map((c) => [c.id, c.name]));
  const records: ChurnEnrollmentRecord[] = enrollments.map((e) => ({
    status: e.status,
    centerId: classCenter.get(e.classId) ?? null,
    startedAt: e.startedAt ?? e.enrolledAt,
    endedAt: e.endedAt,
  }));

  const report = buildChurnReport(records, centerNames);

  return (
    <div className="space-y-5 p-4">
      <div>
        <h1 className="text-xl font-bold text-neutral-900">Báo cáo churn / rời lớp</h1>
        <p className="text-sm text-neutral-500">
          Tỉ lệ học viên rời lớp (WITHDREW) theo kỳ và theo cơ sở — mẫu số là số đang
          học ở đầu kỳ.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Tổng ghi danh" value={num(report.summary.total)} />
        <Stat label="Đang học" value={num(report.summary.active)} />
        <Stat
          label="Đã rời lớp"
          value={num(report.summary.withdrew)}
          hint={`Tỉ lệ rời ${pct(report.summary.churnRate)}`}
        />
        <Stat label="Đã hoàn thành" value={num(report.summary.completed)} />
      </div>

      {report.summary.total === 0 ? (
        <p className="rounded-xl border border-dashed border-neutral-300 bg-white p-6 text-center text-sm text-neutral-500">
          Chưa có dữ liệu ghi danh trong phạm vi của bạn.
        </p>
      ) : null}

      {/* Xu hướng theo tháng */}
      <Card title="Xu hướng rời lớp theo tháng">
        <LineChart
          data={report.byMonth.map((m) => ({
            name: m.period,
            "Đang học đầu kỳ": m.activeAtStart,
            "Rời lớp": m.withdrew,
          }))}
          xKey="name"
          lines={[
            { key: "Đang học đầu kỳ", name: "Đang học đầu kỳ", color: "#7C3AED" },
            { key: "Rời lớp", name: "Rời lớp", color: "#F97316" },
          ]}
          height={300}
        />
      </Card>

      {/* Bảng tỉ lệ churn theo tháng */}
      <Card title="Tỉ lệ churn theo tháng">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-neutral-400">
              <tr>
                <th className="px-3 py-2">Kỳ</th>
                <th className="px-3 py-2 text-right">Đang học đầu kỳ</th>
                <th className="px-3 py-2 text-right">Rời lớp</th>
                <th className="px-3 py-2 text-right">Tỉ lệ churn</th>
              </tr>
            </thead>
            <tbody>
              {report.byMonth.map((m) => (
                <tr key={m.period} className="border-t">
                  <td className="px-3 py-2">{m.period}</td>
                  <td className="px-3 py-2 text-right">{num(m.activeAtStart)}</td>
                  <td className="px-3 py-2 text-right">{num(m.withdrew)}</td>
                  <td className="px-3 py-2 text-right font-medium">{pct(m.churnRate)}</td>
                </tr>
              ))}
              {report.byMonth.length === 0 ? (
                <tr>
                  <td className="px-3 py-4 text-center text-neutral-400" colSpan={4}>
                    Chưa có dữ liệu.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Theo cơ sở */}
      <Card title="Rời lớp theo cơ sở">
        <BarChart
          data={report.byCenter.map((c) => ({
            name: c.label,
            "Tổng ghi danh": c.total,
            "Rời lớp": c.withdrew,
          }))}
          xKey="name"
          bars={[
            { key: "Tổng ghi danh", name: "Tổng ghi danh", color: "#7C3AED" },
            { key: "Rời lớp", name: "Rời lớp", color: "#F97316" },
          ]}
          height={300}
        />
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-neutral-400">
              <tr>
                <th className="px-3 py-2">Cơ sở</th>
                <th className="px-3 py-2 text-right">Tổng</th>
                <th className="px-3 py-2 text-right">Rời lớp</th>
                <th className="px-3 py-2 text-right">Tỉ lệ rời</th>
              </tr>
            </thead>
            <tbody>
              {report.byCenter.map((c) => (
                <tr key={c.key} className="border-t">
                  <td className="px-3 py-2">{c.label}</td>
                  <td className="px-3 py-2 text-right">{num(c.total)}</td>
                  <td className="px-3 py-2 text-right">{num(c.withdrew)}</td>
                  <td className="px-3 py-2 text-right font-medium">{pct(c.churnRate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
