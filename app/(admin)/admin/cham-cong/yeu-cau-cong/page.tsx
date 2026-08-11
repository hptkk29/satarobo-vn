import { redirect } from "next/navigation";
import { ClipboardEdit } from "lucide-react";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/auth/check-permission";
import { resolveActor } from "@/lib/auth/actor";
import { scopedDb } from "@/lib/db-scope";
import { isWeekendEditWindow } from "@/lib/shifts";
import { AdjustRequestForm } from "./_components/request-form";
import { formatDateVN } from "@/lib/format/date";

export const metadata = { title: "Yêu cầu chỉnh công | Admin" };
export const dynamic = "force-dynamic";

const STATUS_BADGE: Record<string, string> = {
  PENDING: "bg-state-warning-soft text-state-warning-ink",
  APPROVED: "bg-state-success-soft text-state-success-ink",
  REJECTED: "bg-state-danger-soft text-state-danger-ink",
};
const STATUS_LABEL: Record<string, string> = {
  PENDING: "Chờ duyệt",
  APPROVED: "Đã duyệt",
  REJECTED: "Từ chối",
};

export default async function YeuCauCongPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!(await checkPermission("hr_attendance:checkin", { centerId: session.user.centerId }))) redirect("/dashboard");

  const sdb = scopedDb(await resolveActor(session.user.id));
  const requests = await sdb.timesheetAdjustmentRequest.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return (
    <div className="max-w-2xl space-y-5 p-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
          <ClipboardEdit className="h-6 w-6 text-primary" /> Yêu cầu chỉnh công
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Bạn không tự sửa công — gửi yêu cầu kèm lý do, quản lý cơ sở duyệt (admin cấp cao duyệt mọi lúc).
        </p>
      </div>

      {!isWeekendEditWindow(new Date()) && (
        <p className="rounded-lg bg-state-warning-soft px-3 py-2 text-xs text-state-warning-ink">
          Khuyến nghị gửi yêu cầu chỉnh sửa vào Thứ 7 / Chủ nhật. Ngày thường vẫn gửi được, quản lý
          sẽ xử lý theo lịch.
        </p>
      )}

      <AdjustRequestForm />

      <section>
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wider text-muted-foreground">
          Yêu cầu đã gửi
        </h2>
        {requests.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            Chưa có yêu cầu nào.
          </p>
        ) : (
          <ul className="space-y-2">
            {requests.map((r) => (
              <li key={r.id} className="rounded-xl border border-border bg-card p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-foreground">
                    {formatDateVN(r.date)}
                  </span>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_BADGE[r.status]}`}>
                    {STATUS_LABEL[r.status]}
                  </span>
                </div>
                {r.requested && <p className="mt-1 text-sm text-foreground">Đề nghị: {r.requested}</p>}
                <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{r.reason}</p>
                {r.reviewNote && (
                  <p className="mt-2 rounded-lg bg-muted p-2 text-sm text-muted-foreground">
                    Phản hồi: {r.reviewNote}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
