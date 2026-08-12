import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus, FlaskConical } from "lucide-react";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/auth/check-permission";
import { resolveActor } from "@/lib/auth/actor";
import { scopedDb } from "@/lib/db-scope";
import { TrialConfigSection } from "./_components/config-section";
import { formatDateVN } from "@/lib/format/date";
import { PageHelp } from "@/components/admin/ui/page-help";
import { PhanTrangBang } from "@/components/ui/phan-trang-bang";

export const metadata = { title: "Lớp trải nghiệm | Admin" };
export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  OPEN: "Đang mở",
  RUNNING: "Đang chạy",
  COMPLETED: "Hoàn tất",
  CANCELLED: "Đã huỷ",
};
const STATUS_BADGE: Record<string, string> = {
  OPEN: "bg-state-success-soft text-state-success-ink",
  RUNNING: "bg-state-info-soft text-state-info-ink",
  COMPLETED: "bg-muted text-muted-foreground",
  CANCELLED: "bg-state-danger-soft text-state-danger-ink",
};

export default async function TrialClassesPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!(await checkPermission("trials:view"))) redirect("/dashboard");

  const actor = await resolveActor(session.user.id);
  const sdb = scopedDb(actor);

  const canManage = await checkPermission("trials:manage");
  const canConfig = await checkPermission("trials:config");

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
          <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
            <FlaskConical className="h-6 w-6 text-primary" /> Lớp trải nghiệm
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Lớp học thử nhiều buổi
          </p>
        </div>
        {canManage && (
          <Link
            href="/trial-classes/new"
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white hover:bg-primary-dark"
          >
            <Plus className="h-4 w-4" /> Tạo lớp
          </Link>
        )}
      </div>

      <PageHelp>
        <p>
          Lớp học thử nhiều buổi (RoboSim/Robot). Xếp con từ lead vào lớp, điểm
          danh từng buổi, theo dõi sĩ số.
        </p>
      </PageHelp>

      {/* Cấu hình số buổi (trials:config — QĐ-T3b: CM giữ qua action riêng) */}
      <TrialConfigSection canConfig={canConfig} config={activeConfig ?? null} />

      {/* Danh sách lớp */}
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <PhanTrangBang>
          <table className="w-full text-sm">
            <thead className="bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-semibold">Lớp</th>
                <th className="px-4 py-3 font-semibold">Ngày BĐ</th>
                <th className="px-4 py-3 font-semibold">Giờ</th>
                <th className="px-4 py-3 font-semibold">Sĩ số</th>
                <th className="px-4 py-3 font-semibold">Số buổi</th>
                <th className="px-4 py-3 font-semibold">Trạng thái</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {classes.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-8 text-center text-muted-foreground"
                  >
                    Chưa có lớp trải nghiệm nào.
                  </td>
                </tr>
              )}
              {classes.map((c) => {
                const used = c.enrollments.length;
                const full = used >= c.capacity;
                return (
                  <tr key={c.id} className="hover:bg-muted">
                    <td className="px-4 py-3">
                      <Link
                        href={`/trial-classes/${c.id}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {c.name}
                      </Link>
                      <div className="text-xs text-muted-foreground">
                        {c.code}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-foreground">
                      {c.startDate ? formatDateVN(c.startDate) : "Theo lịch hẹn"}
                    </td>
                    <td className="px-4 py-3 text-foreground">
                      {c.startTime}–{c.endTime}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={
                          full
                            ? "font-semibold text-state-danger-ink"
                            : "text-foreground"
                        }
                      >
                        {used}/{c.capacity}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-foreground">
                      {c.sessionCount}
                      {c.config?.name ? (
                        <span className="ml-1 text-xs text-muted-foreground">
                          ({c.config.name})
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_BADGE[c.status] ?? "bg-muted text-muted-foreground"}`}
                      >
                        {STATUS_LABEL[c.status] ?? c.status}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </PhanTrangBang>
      </div>
    </div>
  );
}
