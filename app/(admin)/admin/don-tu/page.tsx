import { redirect } from "next/navigation";
import { ClipboardList } from "lucide-react";
import { auth } from "@/lib/auth";
import { hasRole } from "@/lib/auth/permissions";
import { resolveActor } from "@/lib/auth/actor";
import { scopedDb } from "@/lib/db-scope";
import { formatDateVN } from "@/lib/format/date";
import {
  WR_KIND_LABEL,
  WR_STATUS_LABEL,
  type WorkRequestKindV,
  type WorkRequestStatusV,
} from "@/lib/work-request";
import { WorkRequestReview } from "./_components/work-request-review";

export const metadata = { title: "Đơn từ giáo viên | Admin" };
export const dynamic = "force-dynamic";

const STATUS_CLS: Record<WorkRequestStatusV, string> = {
  PENDING: "bg-state-warning-soft text-state-warning-ink",
  APPROVED: "bg-state-success-soft text-state-success-ink",
  REJECTED: "bg-state-danger-soft text-state-danger-ink",
};

// BGĐ 31/07 — màn DUYỆT ĐƠN GV cho quản lý (trước đây chỉ có action, không có UI:
// GV gửi đơn xong không ai thấy). Duyệt đơn nghỉ dạy/dạy thay sẽ cập nhật luôn
// buổi học tương ứng (lib/work-request-apply.ts).
export default async function WorkRequestsAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  // Cùng luật với reviewWorkRequest: chỉ Quản lý cơ sở + SUPER_ADMIN.
  const isManager = hasRole(session.user, "CENTER_MANAGER");
  const isSuper = hasRole(session.user, "SUPER_ADMIN");
  if (!isManager && !isSuper) redirect("/dashboard?error=unauthorized");

  const { status } = await searchParams;
  const statusFilter: WorkRequestStatusV =
    status === "APPROVED" || status === "REJECTED" ? status : "PENDING";

  // WorkRequest ∉ SCOPED_MODELS → scopedDb pass-through; cách ly cơ sở làm TAY
  // (SUPER_ADMIN thấy hết, quản lý chỉ thấy cơ sở mình) — khớp guard của action.
  const sdb = scopedDb(await resolveActor(session.user.id));
  const requests = await sdb.workRequest.findMany({
    where: {
      status: statusFilter,
      ...(isSuper ? {} : { centerId: session.user.centerId ?? null }),
    },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      kind: true,
      status: true,
      fromDate: true,
      toDate: true,
      startTime: true,
      endTime: true,
      className: true,
      classId: true,
      targetUserId: true,
      reason: true,
      reviewNote: true,
      reviewedByName: true,
      reviewedAt: true,
      createdAt: true,
      requesterId: true,
    },
  });

  // Tên GV gửi đơn + người dạy thay (User ∈ SCOPE_EXEMPT → đọc trực tiếp).
  const userIds = [
    ...new Set(
      requests.flatMap((r) => [r.requesterId, r.targetUserId].filter((x): x is string => !!x)),
    ),
  ];
  const users = userIds.length
    ? await sdb.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, name: true, email: true },
      })
    : [];
  const nameOf = new Map(users.map((u) => [u.id, u.name ?? u.email ?? u.id]));

  const tabs: { key: WorkRequestStatusV; label: string }[] = [
    { key: "PENDING", label: "Chờ duyệt" },
    { key: "APPROVED", label: "Đã duyệt" },
    { key: "REJECTED", label: "Từ chối" },
  ];

  return (
    <div className="max-w-5xl space-y-4 p-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
          <ClipboardList className="h-6 w-6 text-primary" /> Đơn từ giáo viên
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Duyệt đơn <strong>Nghỉ buổi dạy</strong> / <strong>Dạy thay</strong> sẽ cập nhật
          luôn buổi học tương ứng (huỷ buổi / gán GV dạy thay).
        </p>
      </div>

      <div className="flex gap-2">
        {tabs.map((t) => (
          <a
            key={t.key}
            href={`/don-tu?status=${t.key}`}
            className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${ statusFilter === t.key ? "bg-primary text-white" : "border border-border bg-card text-muted-foreground hover:bg-muted" }`}
          >
            {t.label}
          </a>
        ))}
      </div>

      {requests.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Không có đơn nào ở trạng thái {WR_STATUS_LABEL[statusFilter].toLowerCase()}.
        </p>
      ) : (
        <div className="space-y-3">
          {requests.map((r) => (
            <div key={r.id} className="rounded-xl border border-border bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-foreground">
                    {WR_KIND_LABEL[r.kind as WorkRequestKindV] ?? r.kind}
                    <span className="ml-2 text-sm font-normal text-muted-foreground">
                      — {nameOf.get(r.requesterId) ?? "GV"}
                    </span>
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {r.fromDate ? formatDateVN(r.fromDate) : "—"}
                    {r.toDate && r.toDate.getTime() !== r.fromDate?.getTime()
                      ? ` → ${formatDateVN(r.toDate)}`
                      : ""}
                    {r.startTime ? ` · ${r.startTime}${r.endTime ? `–${r.endTime}` : ""}` : ""}
                    {r.className ? ` · Lớp ${r.className}` : ""}
                    {r.targetUserId ? ` · Người dạy thay: ${nameOf.get(r.targetUserId) ?? "—"}` : ""}
                  </p>
                </div>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${ STATUS_CLS[r.status as WorkRequestStatusV] }`}
                >
                  {WR_STATUS_LABEL[r.status as WorkRequestStatusV]}
                </span>
              </div>

              <p className="mt-2 whitespace-pre-wrap rounded-lg bg-muted p-2.5 text-sm text-foreground">
                {r.reason}
              </p>

              {r.status !== "PENDING" && (
                <p className="mt-2 text-xs text-muted-foreground">
                  {r.reviewedByName ? `${r.reviewedByName} · ` : ""}
                  {r.reviewedAt ? formatDateVN(r.reviewedAt) : ""}
                  {r.reviewNote ? ` — ${r.reviewNote}` : ""}
                </p>
              )}

              {r.status === "PENDING" && (
                <WorkRequestReview
                  requestId={r.id}
                  appliesToSchedule={r.kind === "CLASS_OFF" || r.kind === "SUB_TEACH"}
                />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
