import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus, FlaskConical } from "lucide-react";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/auth/check-permission";
import { resolveActor } from "@/lib/auth/actor";
import { scopedDb } from "@/lib/db-scope";
import { TrialConfigSection } from "./_components/config-section";
import { formatDateVN } from "@/lib/format/date";

export const metadata = { title: "Lớp trải nghiệm | Admin" };
export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  OPEN: "Đang mở",
  RUNNING: "Đang chạy",
  COMPLETED: "Hoàn tất",
  CANCELLED: "Đã huỷ",
};
const STATUS_BADGE: Record<string, string> = {
  OPEN: "bg-emerald-100 text-emerald-700",
  RUNNING: "bg-blue-100 text-blue-700",
  COMPLETED: "bg-gray-100 text-gray-600",
  CANCELLED: "bg-rose-100 text-rose-700",
};

export default async function TrialClassesPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!(await checkPermission("trials:view"))) redirect("/dashboard");

  const actor = await resolveActor(session.user.id);
  const sdb = scopedDb(actor);

  const canManage = (await checkPermission("trials:manage"));
  const canConfig = (await checkPermission("trials:config"));

  const [classes, activeConfig] = await Promise.all([
    sdb.trialClassV2.findMany({
      orderBy: [{ status: "asc" }, { startDate: "desc" }],
      take: 200,
      include: {
        config: { select: { name: true, sessionCount: true } },
        enrollments: { where: { status: "ACTIVE" }, select: { id: true } },
      },
    }),
    sdb.trialProgramConfig.findFirst({
      where: { active: true },
      orderBy: { updatedAt: "desc" },
      select: { id: true, name: true, sessionCount: true },
    }),
  ]);

  return (
    <div className="max-w-6xl p-6">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
            <FlaskConical className="h-6 w-6 text-orange-500" /> Lớp trải nghiệm
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Lớp học thử nhiều buổi (RoboSim/Robot). Xếp con từ lead vào lớp, điểm danh
            từng buổi, theo dõi sĩ số.
          </p>
        </div>
        {canManage && (
          <Link
            href="/trial-classes/new"
            className="inline-flex items-center gap-1.5 rounded-lg bg-orange-500 px-3 py-2 text-sm font-semibold text-white hover:bg-orange-600"
          >
            <Plus className="h-4 w-4" /> Tạo lớp
          </Link>
        )}
      </div>

      {/* Cấu hình số buổi (trials:config — QĐ-T3b: CM giữ qua action riêng) */}
      <TrialConfigSection
        canConfig={canConfig}
        config={activeConfig ?? null}
      />

      {/* Danh sách lớp */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-3 font-semibold">Lớp</th>
              <th className="px-4 py-3 font-semibold">Ngày BĐ</th>
              <th className="px-4 py-3 font-semibold">Giờ</th>
              <th className="px-4 py-3 font-semibold">Sĩ số</th>
              <th className="px-4 py-3 font-semibold">Số buổi</th>
              <th className="px-4 py-3 font-semibold">Trạng thái</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {classes.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                  Chưa có lớp trải nghiệm nào.
                </td>
              </tr>
            )}
            {classes.map((c) => {
              const used = c.enrollments.length;
              const full = used >= c.capacity;
              return (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <Link
                      href={`/trial-classes/${c.id}`}
                      className="font-medium text-orange-600 hover:underline"
                    >
                      {c.name}
                    </Link>
                    <div className="text-xs text-gray-400">{c.code}</div>
                  </td>
                  <td className="px-4 py-3 text-gray-700">
                    {c.startDate ? formatDateVN(c.startDate) : "Theo lịch hẹn"}
                  </td>
                  <td className="px-4 py-3 text-gray-700">
                    {c.startTime}–{c.endTime}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        full ? "font-semibold text-rose-600" : "text-gray-700"
                      }
                    >
                      {used}/{c.capacity}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-700">
                    {c.sessionCount}
                    {c.config?.name ? (
                      <span className="ml-1 text-xs text-gray-400">
                        ({c.config.name})
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                        STATUS_BADGE[c.status] ?? "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {STATUS_LABEL[c.status] ?? c.status}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
