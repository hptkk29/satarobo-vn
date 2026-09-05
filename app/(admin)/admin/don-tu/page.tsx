// app/(admin)/admin/don-tu/page.tsx — DUYỆT ĐƠN TỪ (mọi nhân sự, L5). Gate theo CƠ SỞ NHẬN ĐƠN:
// `hr_attendance:approve` tại từng cơ sở (T-06) — Quản lý cơ sở thấy đơn cơ sở mình, Giám đốc/HO
// thấy mọi cơ sở. Không đọc `session.user.centerId`, không so vai.
import Link from "next/link";
import { redirect } from "next/navigation";
import { ClipboardList } from "lucide-react";
import { auth } from "@/lib/auth";
import { resolveActor } from "@/lib/auth/actor";
import { scopedDb } from "@/lib/db-scope";
import { formatDateVN } from "@/lib/format/date";
import { approvableCenters } from "@/lib/cham-cong/request-actions";
import { HO_CENTER_ID } from "@/lib/cham-cong/home-center";
import { WR_KIND_LABEL, WR_STATUS_LABEL, type WorkRequestKindV, type WorkRequestStatusV } from "@/lib/work-request";
import { WorkRequestReview } from "./_components/work-request-review";

export const metadata = { title: "Duyệt đơn từ | Admin" };
export const dynamic = "force-dynamic";

const STATUS_CLS: Record<WorkRequestStatusV, string> = {
  PENDING: "bg-state-warning-soft text-state-warning-ink",
  APPROVED: "bg-state-success-soft text-state-success-ink",
  REJECTED: "bg-state-danger-soft text-state-danger-ink",
};

function effectHint(r: { kind: string; targetUserId: string | null; toDate: Date | null; fromDate: Date | null }): string | null {
  switch (r.kind) {
    case "CLASS_OFF": return "huỷ buổi học của lớp trong ngày (sinh buổi bù theo luật lớp)";
    case "SUB_TEACH": return "gán giáo viên dạy thay cho buổi đó";
    case "SHIFT_SWAP": return `đổi mã ca trên lưới phân ca${r.targetUserId ? " cho cả hai người" : ""} và tính lại công`;
    case "LEAVE": return `ghi mã nghỉ lên lưới cho ${r.fromDate && r.toDate ? Math.round((r.toDate.getTime() - r.fromDate.getTime()) / 86_400_000) + 1 : 1} ngày${r.targetUserId ? ", xếp ca người làm thay" : ""}`;
    case "TIMESHEET_FIX": return "ghi mốc giờ chỉnh tay và tính lại công ngày đó";
    default: return null;
  }
}

export default async function WorkRequestsAdminPage({ searchParams }: { searchParams: Promise<{ status?: string; coSo?: string }> }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const allowed = await approvableCenters();
  if (allowed.size === 0) redirect("/dashboard?error=unauthorized");

  const { status, coSo } = await searchParams;
  const statusFilter: WorkRequestStatusV = status === "APPROVED" || status === "REJECTED" ? status : "PENDING";
  const actor = await resolveActor(session.user.id);
  const sdb = scopedDb(actor);
  const centers = await sdb.center.findMany({ where: { id: { in: [...allowed] } }, select: { id: true, code: true, name: true }, orderBy: { displayOrder: "asc" } });
  const blocks = [...centers.map((c) => ({ id: c.id, label: `${c.code} · ${c.name}` })), ...(allowed.has(HO_CENTER_ID) ? [{ id: HO_CENTER_ID, label: "Hội sở" }] : [])];
  const centerIds = coSo && allowed.has(coSo) ? [coSo] : [...allowed];

  const requests = await sdb.workRequest.findMany({
    where: { status: statusFilter, centerId: { in: centerIds } },
    orderBy: [{ submittedLate: "desc" }, { createdAt: "desc" }],
    take: 200,
    select: {
      id: true, kind: true, status: true, centerId: true, fromDate: true, toDate: true, startTime: true, endTime: true,
      className: true, targetUserId: true, requesterNewTemplateId: true, targetNewTemplateId: true, leaveTypeId: true,
      requestedInAt: true, requestedOutAt: true, submittedLate: true, applyError: true, appliedAt: true, detail: true,
      reason: true, reviewNote: true, reviewedByName: true, reviewedAt: true, createdAt: true, requesterId: true,
    },
  });
  const userIds = [...new Set(requests.flatMap((r) => [r.requesterId, r.targetUserId].filter((x): x is string => !!x)))];
  const templateIds = [...new Set(requests.flatMap((r) => [r.requesterNewTemplateId, r.targetNewTemplateId].filter((x): x is string => !!x)))];
  const leaveIds = [...new Set(requests.map((r) => r.leaveTypeId).filter((x): x is string => !!x))];
  const [users, templates, leaves] = await Promise.all([
    userIds.length ? sdb.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, email: true } }) : [],
    templateIds.length ? sdb.shiftTemplate.findMany({ where: { id: { in: templateIds } }, select: { id: true, code: true } }) : [],
    leaveIds.length ? sdb.leaveType.findMany({ where: { id: { in: leaveIds } }, select: { id: true, name: true } }) : [],
  ]);
  const nameOf = new Map(users.map((u) => [u.id, u.name ?? u.email ?? u.id]));
  const codeOf = new Map(templates.map((t) => [t.id, t.code]));
  const leaveOf = new Map(leaves.map((l) => [l.id, l.name]));
  const blockLabel = new Map(blocks.map((b) => [b.id, b.label]));
  const tabs: { key: WorkRequestStatusV; label: string }[] = [
    { key: "PENDING", label: "Chờ duyệt" },
    { key: "APPROVED", label: "Đã duyệt" },
    { key: "REJECTED", label: "Từ chối" },
  ];
  const qs = (s: WorkRequestStatusV, c?: string) => `/don-tu?status=${s}${c ? `&coSo=${c}` : ""}`;

  return (
    <div className="max-w-5xl space-y-4 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground"><ClipboardList className="h-6 w-6 text-primary" /> Duyệt đơn từ</h1>
          <p className="mt-1 text-sm text-muted-foreground">Đơn của mọi nhân sự (GV, tư vấn, giáo vụ, HO) gửi tới cơ sở chịu công. Duyệt là áp ngay: đổi ca / ghi nghỉ / ghi giờ chỉnh tay / huỷ buổi / dạy thay. Áp không được thì đơn giữ Chờ duyệt kèm lý do.</p>
        </div>
        <Link href="/don-tu/cua-toi" className="rounded-lg border border-border bg-card px-3 py-2 text-sm font-semibold hover:bg-muted">Đơn của tôi</Link>
      </div>

      <div className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <Link key={t.key} href={qs(t.key, coSo)} className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${statusFilter === t.key ? "bg-primary text-white" : "border border-border bg-card text-muted-foreground hover:bg-muted"}`}>{t.label}</Link>
        ))}
        {blocks.length > 1 && (
          <span className="ml-auto flex flex-wrap gap-1">
            <Link href={qs(statusFilter)} className={`rounded-md border px-2 py-1 text-xs ${!coSo ? "border-primary bg-primary text-white" : "border-border"}`}>Tất cả</Link>
            {blocks.map((b) => <Link key={b.id} href={qs(statusFilter, b.id)} className={`rounded-md border px-2 py-1 text-xs ${coSo === b.id ? "border-primary bg-primary text-white" : "border-border"}`}>{b.label}</Link>)}
          </span>
        )}
      </div>

      {requests.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Không có đơn nào ở trạng thái {WR_STATUS_LABEL[statusFilter].toLowerCase()}.</p>
      ) : (
        <div className="space-y-3">
          {requests.map((r) => (
            <div key={r.id} className="rounded-xl border border-border bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-foreground">
                    {WR_KIND_LABEL[r.kind as WorkRequestKindV] ?? r.kind}
                    <span className="ml-2 text-sm font-normal text-muted-foreground">— {nameOf.get(r.requesterId) ?? "nhân sự"}</span>
                    {r.submittedLate && <span className="ml-2 rounded-full bg-state-warning-soft px-2 py-0.5 text-[11px] font-semibold text-state-warning-ink">Nộp muộn</span>}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {r.centerId ? (blockLabel.get(r.centerId) ?? r.centerId) : "—"}
                    {" · "}{r.fromDate ? formatDateVN(r.fromDate) : "—"}
                    {r.toDate && r.toDate.getTime() !== r.fromDate?.getTime() ? ` → ${formatDateVN(r.toDate)}` : ""}
                    {r.startTime ? ` · ${r.startTime}${r.endTime ? `–${r.endTime}` : ""}` : ""}
                    {r.requestedInAt || r.requestedOutAt ? ` · đề nghị vào ${r.requestedInAt ?? "—"} / ra ${r.requestedOutAt ?? "—"}` : ""}
                    {r.className ? ` · Lớp ${r.className}` : ""}
                    {r.requesterNewTemplateId ? ` · Ca mới: ${codeOf.get(r.requesterNewTemplateId) ?? "?"}` : ""}
                    {r.leaveTypeId ? ` · ${leaveOf.get(r.leaveTypeId) ?? "Nghỉ"}` : ""}
                    {r.targetUserId ? ` · Người thay: ${nameOf.get(r.targetUserId) ?? "—"}${r.targetNewTemplateId ? ` (ca ${codeOf.get(r.targetNewTemplateId) ?? "?"})` : ""}` : ""}
                  </p>
                </div>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_CLS[r.status as WorkRequestStatusV]}`}>{WR_STATUS_LABEL[r.status as WorkRequestStatusV]}</span>
              </div>
              <p className="mt-2 whitespace-pre-wrap rounded-lg bg-muted p-2.5 text-sm text-foreground">{r.reason}</p>
              {r.detail && <p className="mt-1 text-xs text-muted-foreground">{r.detail}</p>}
              {r.status === "PENDING" && r.applyError && <p className="mt-2 rounded-lg bg-state-danger-soft p-2 text-xs text-state-danger-ink">Lần duyệt trước không áp được: {r.applyError}</p>}
              {r.status !== "PENDING" && (
                <p className="mt-2 text-xs text-muted-foreground">
                  {r.reviewedByName ? `${r.reviewedByName} · ` : ""}{r.reviewedAt ? formatDateVN(r.reviewedAt) : ""}{r.reviewNote ? ` — ${r.reviewNote}` : ""}{r.appliedAt ? " · đã áp lên lịch" : ""}
                </p>
              )}
              {r.status === "PENDING" && <WorkRequestReview requestId={r.id} effectHint={effectHint(r)} />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
