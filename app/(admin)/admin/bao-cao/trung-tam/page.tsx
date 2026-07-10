import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/auth/check-permission";
import { resolveActor } from "@/lib/auth/actor";
import { scopedDb } from "@/lib/db-scope";
import { LineChart } from "@/components/charts/line-chart";
import { BarChart } from "@/components/charts/bar-chart";
import {
  summarizeFinance,
  revenueByMonth,
  revenueByCenter,
  summarizeSatisfaction,
  summarizeRetention,
  type PaymentRecord,
  type EnrollmentRecord,
  type RatingRecord,
} from "@/lib/reports/trung-tam";

export const metadata = { title: "Báo cáo trung tâm | Admin" };
export const dynamic = "force-dynamic";

const vnd = (n: number) => `${Math.round(n).toLocaleString("vi-VN")} đ`;
const pct = (r: number) => `${Math.round(r * 1000) / 10}%`;

function Stat({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "neutral" | "good" | "warn" | "bad";
}) {
  const toneClass =
    tone === "good"
      ? "text-emerald-700"
      : tone === "warn"
        ? "text-amber-700"
        : tone === "bad"
          ? "text-rose-700"
          : "text-neutral-900";
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4">
      <p className="text-xs font-medium text-neutral-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${toneClass}`}>{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-neutral-400">{hint}</p> : null}
    </div>
  );
}

export default async function CenterReportPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  // Gate: báo cáo tài chính trung tâm → quản lý tài chính (Admin + quản lý cơ sở + Kế toán).
  if (!(await checkPermission("payments:manage"))) {
    redirect("/dashboard");
  }

  const actor = await resolveActor(session.user.id);
  const sdb = scopedDb(actor); // Payment + Class auto-scoped theo cơ sở (HO/SUPER_ADMIN bypass).
  const bypass = actor.isSuperAdmin || actor.isHoLevel;

  // 1. Khoản thanh toán trong phạm vi cơ sở (Payment ∈ SCOPED_MODELS → auto-scope).
  const paymentRows = await sdb.payment.findMany({
    select: { centerId: true, amount: true, accountantStatus: true, paidDate: true },
    take: 5000,
  });
  const payments: PaymentRecord[] = paymentRows.map((p) => ({
    centerId: p.centerId,
    amount: p.amount,
    accountantStatus: p.accountantStatus,
    paidDate: p.paidDate,
  }));

  // 2. Lớp trong phạm vi → map classId→centerId. Enrollment KHÔNG có centerId nên
  // lọc thủ công theo classIds đã scope (AC5: Enrollment không nằm trong SCOPED_MODELS).
  const classRows = await sdb.class.findMany({
    where: { deletedAt: null },
    select: { id: true, centerId: true },
    take: 2000,
  });
  const classToCenter = new Map(classRows.map((c) => [c.id, c.centerId]));
  const classIds = classRows.map((c) => c.id);
  const enrollmentRows = classIds.length
    ? await sdb.enrollment.findMany({
        where: { classId: { in: classIds } },
        select: { studentId: true, classId: true, finalPrice: true, tuition: true, enrolledAt: true },
        take: 10000,
      })
    : [];
  const enrollments: EnrollmentRecord[] = enrollmentRows.map((e) => ({
    studentId: e.studentId,
    centerId: classToCenter.get(e.classId) ?? null,
    finalPrice: e.finalPrice,
    tuition: e.tuition,
    enrolledAt: e.enrolledAt,
  }));

  // 3. Hài lòng — rating sao của khảo sát cơ sở (CENTER_SURVEY). EvaluationRound ∈
  // SCOPED_MODELS + NULL_IS_GLOBAL (#03 Pha B): auto-scope OR-null — round global (null)
  // vẫn lọt vào, nên GIỮ filter tay visibleCenterIds dưới đây (đừng bỏ khi refactor,
  // bỏ là KPI cơ sở gộp cả rating đợt global toàn hệ thống).
  const roundRows = await sdb.evaluationRound.findMany({
    where: {
      scope: "CENTER_SURVEY",
      ...(bypass ? {} : { centerId: { in: actor.visibleCenterIds } }),
    },
    select: { id: true },
    take: 2000,
  });
  const roundIds = roundRows.map((r) => r.id);
  const ratingRows = roundIds.length
    ? await sdb.evalAnswer.findMany({
        where: { response: { roundId: { in: roundIds } }, valueNumber: { not: null } },
        select: { valueNumber: true },
        take: 20000,
      })
    : [];
  const ratings: RatingRecord[] = ratingRows.map((a) => ({ valueNumber: a.valueNumber }));

  // === Tính toán (hàm THUẦN) ===
  const finance = summarizeFinance(payments, enrollments);
  const trend = revenueByMonth(payments);
  const byCenter = revenueByCenter(payments, enrollments);
  const satisfaction = summarizeSatisfaction(ratings);
  const retention = summarizeRetention(enrollments);

  // Tên cơ sở cho bảng/biểu đồ.
  const centerRows = await sdb.center.findMany({ select: { id: true, name: true, code: true } });
  const centerName = new Map(centerRows.map((c) => [c.id, c.code ?? c.name]));
  const labelCenter = (id: string) => (id === "—" ? "Chưa gán cơ sở" : centerName.get(id) ?? id);

  const trendData = trend.map((t) => ({
    month: t.month,
    "Đã xác nhận": t.confirmed,
    "Chờ xác nhận": t.pending,
  }));
  const centerChartData = byCenter.map((c) => ({
    name: labelCenter(c.centerId),
    "Doanh thu": c.confirmed,
    "Công nợ": c.debt,
  }));

  return (
    <div className="space-y-5 p-4">
      <div>
        <h1 className="text-xl font-bold text-neutral-900">Báo cáo trung tâm</h1>
        <p className="text-sm text-neutral-500">
          Tài chính (doanh thu xác nhận, công nợ), mức độ hài lòng và tỷ lệ tái tục — theo phạm vi cơ sở của bạn.
        </p>
      </div>

      {/* Tài chính */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Doanh thu đã xác nhận"
          value={vnd(finance.confirmedRevenue)}
          hint={`${finance.confirmedCount} khoản đã duyệt`}
          tone="good"
        />
        <Stat
          label="Chờ kế toán xác nhận"
          value={vnd(finance.pendingRevenue)}
          tone={finance.pendingRevenue > 0 ? "warn" : "neutral"}
        />
        <Stat
          label="Công nợ"
          value={vnd(finance.debt)}
          hint={`Phải thu ${vnd(finance.totalReceivable)}`}
          tone={finance.debt > 0 ? "bad" : "good"}
        />
        <Stat
          label="Đã hoàn"
          value={vnd(finance.refundedAmount)}
          tone={finance.refundedAmount > 0 ? "warn" : "neutral"}
        />
      </section>

      {/* Hài lòng + tái tục */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Hài lòng trung bình"
          value={satisfaction.count ? `${(Math.round(satisfaction.average * 10) / 10).toFixed(1)} / 5` : "—"}
          hint={`${satisfaction.count} lượt đánh giá`}
          tone={satisfaction.average >= 4 ? "good" : satisfaction.count ? "warn" : "neutral"}
        />
        <Stat
          label="Tỷ lệ hài lòng (4-5★)"
          value={satisfaction.count ? pct(satisfaction.positiveRate) : "—"}
          tone={satisfaction.positiveRate >= 0.8 ? "good" : satisfaction.count ? "warn" : "neutral"}
        />
        <Stat
          label="Tái tục"
          value={retention.totalStudents ? pct(retention.retentionRate) : "—"}
          hint={`${retention.returningStudents}/${retention.totalStudents} học viên tái tục`}
          tone={retention.retentionRate >= 0.5 ? "good" : retention.totalStudents ? "warn" : "neutral"}
        />
        <Stat
          label="Tổng lượt ghi danh"
          value={`${retention.totalEnrollments}`}
          hint={`${retention.totalStudents} học viên`}
        />
      </section>

      {/* Xu hướng doanh thu */}
      <section className="rounded-xl border border-neutral-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-neutral-700">Xu hướng doanh thu theo tháng</h2>
        {trendData.length > 0 ? (
          <LineChart
            data={trendData}
            xKey="month"
            lines={[
              { key: "Đã xác nhận", name: "Đã xác nhận", color: "#10B981" },
              { key: "Chờ xác nhận", name: "Chờ xác nhận", color: "#F59E0B" },
            ]}
            height={300}
          />
        ) : (
          <p className="py-8 text-center text-sm text-neutral-400">Chưa có khoản thanh toán trong kỳ.</p>
        )}
      </section>

      {/* Doanh thu / công nợ theo cơ sở */}
      <section className="rounded-xl border border-neutral-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-neutral-700">Doanh thu & công nợ theo cơ sở</h2>
        {centerChartData.length > 0 ? (
          <BarChart
            data={centerChartData}
            xKey="name"
            bars={[
              { key: "Doanh thu", name: "Doanh thu", color: "#7C3AED" },
              { key: "Công nợ", name: "Công nợ", color: "#F97316" },
            ]}
            height={300}
          />
        ) : (
          <p className="py-8 text-center text-sm text-neutral-400">Chưa có dữ liệu cơ sở trong kỳ.</p>
        )}
      </section>

      {/* Bảng chi tiết theo cơ sở */}
      <section className="rounded-xl border border-neutral-200 bg-white">
        <div className="border-b border-neutral-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-neutral-700">Chi tiết theo cơ sở</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="text-left text-xs text-neutral-400">
              <tr>
                <th className="px-4 py-2">Cơ sở</th>
                <th className="px-4 py-2 text-right">Đã xác nhận</th>
                <th className="px-4 py-2 text-right">Chờ xác nhận</th>
                <th className="px-4 py-2 text-right">Phải thu</th>
                <th className="px-4 py-2 text-right">Công nợ</th>
              </tr>
            </thead>
            <tbody>
              {byCenter.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-neutral-400">
                    Không có dữ liệu trong phạm vi cơ sở.
                  </td>
                </tr>
              ) : (
                byCenter.map((c) => (
                  <tr key={c.centerId} className="border-t">
                    <td className="px-4 py-2 font-medium">{labelCenter(c.centerId)}</td>
                    <td className="px-4 py-2 text-right text-emerald-700">{vnd(c.confirmed)}</td>
                    <td className="px-4 py-2 text-right text-amber-600">{vnd(c.pending)}</td>
                    <td className="px-4 py-2 text-right">{vnd(c.receivable)}</td>
                    <td className="px-4 py-2 text-right font-semibold text-rose-600">{vnd(c.debt)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
