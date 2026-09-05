"use server";

// lib/cham-cong/request-actions.ts — L5: Server Action ĐƠN TỪ dùng chung (site admin lẫn site GV
// cùng gọi — giống `lib/lead/intake/quick-form-action.ts`). Quyền qua `can()`:
//   · nộp đơn   → `hr_attendance:checkin` tại cơ sở nhận đơn (mọi nhân sự có chấm công).
//   · duyệt đơn → `hr_attendance:approve` tại cơ sở nhận đơn (T-06: Quản lý cơ sở / Giám đốc).
// Hệ quả (đổi lưới ca, ghi giờ chỉnh tay, huỷ buổi/dạy thay) nằm trong `lib/cham-cong/requests.ts`.
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/auth/check-permission";
import { writeAudit } from "@/lib/audit/audit-log";
import { notifyStaff } from "@/lib/notifications/notify";
import { db } from "@/lib/db";
import { WORK_REQUEST_KINDS, WR_KIND_LABEL, diffHours, type WorkRequestKindV } from "@/lib/work-request";
import { HO_CENTER_ID, loadCenterMap } from "./home-center";
import { approversOfCenter, decideRequest, resolveRequestCenter, submitAttendanceRequest } from "./requests";
import { vnYmd } from "@/lib/time/vn";

type Res = { ok: true; note?: string } | { ok: false; error: string };

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ngày không hợp lệ");
const hhmm = z.string().regex(/^\d{1,2}:\d{2}$/, "Giờ không hợp lệ");
const opt = <T extends z.ZodTypeAny>(s: T) => s.optional().nullable();

const submitSchema = z.object({
  kind: z.enum(WORK_REQUEST_KINDS),
  fromDate: opt(ymd),
  toDate: opt(ymd),
  startTime: opt(hhmm),
  endTime: opt(hhmm),
  hours: opt(z.coerce.number().min(0).max(24)),
  className: opt(z.string().max(200)),
  classId: opt(z.string().max(60)),
  targetUserId: opt(z.string().max(60)),
  requesterNewTemplateId: opt(z.string().max(60)),
  targetNewTemplateId: opt(z.string().max(60)),
  leaveTypeId: opt(z.string().max(60)),
  requestedInAt: opt(hhmm),
  requestedOutAt: opt(hhmm),
  chosenCenterId: opt(z.string().max(60)),
  detail: opt(z.string().max(500)),
  reason: z.string().trim().min(1, "Nhập lý do").max(3000),
});

function parseYmd(s: string | null | undefined): Date | null {
  if (!s) return null;
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export async function submitRequestAction(input: unknown): Promise<Res> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Chưa đăng nhập" };
  const p = submitSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" };
  const d = p.data;
  const from = parseYmd(d.fromDate);

  // Cổng quyền: người nộp phải có quyền chấm công tại cơ sở nhận đơn (đúng nơi sẽ chịu công).
  const resolved = await resolveRequestCenter(session.user.id, from);
  const gateCenter = resolved.centerId ?? d.chosenCenterId ?? null;
  if (!gateCenter) return { ok: false, error: "Bạn thuộc Hội sở — chọn cơ sở nhận đơn" };
  if (!(await checkPermission("hr_attendance:checkin", { centerId: gateCenter }))) {
    return { ok: false, error: "Không có quyền nộp đơn tại cơ sở này" };
  }

  const r = await submitAttendanceRequest({
    requesterId: session.user.id,
    kind: d.kind,
    fromDate: from,
    toDate: parseYmd(d.toDate),
    startTime: d.startTime ?? null,
    endTime: d.endTime ?? null,
    hours: d.kind === "OT" ? diffHours(d.startTime, d.endTime) : d.kind === "TIMESHEET_FIX" ? (d.hours ?? null) : null,
    className: d.className ?? null,
    classId: d.classId ?? null,
    targetUserId: d.targetUserId ?? null,
    requesterNewTemplateId: d.requesterNewTemplateId ?? null,
    targetNewTemplateId: d.targetNewTemplateId ?? null,
    leaveTypeId: d.leaveTypeId ?? null,
    requestedInAt: d.requestedInAt ?? null,
    requestedOutAt: d.requestedOutAt ?? null,
    chosenCenterId: d.chosenCenterId ?? null,
    detail: d.detail ?? null,
    reason: d.reason,
  });
  if (!r.ok) return r;

  // Báo người duyệt tại cơ sở nhận đơn (không báo chính người nộp nếu họ cũng là người duyệt).
  const approvers = (await approversOfCenter(r.centerId)).filter((id) => id !== session.user.id);
  if (approvers.length > 0) {
    const label = WR_KIND_LABEL[d.kind as WorkRequestKindV] ?? d.kind;
    await notifyStaff({
      userIds: approvers,
      dedupeKey: `request.submitted:${r.id}`,
      title: `Đơn ${label}${d.fromDate ? ` ${d.fromDate}` : ""} — ${session.user.name ?? "nhân sự"}${r.submittedLate ? " (nộp muộn)" : ""}`,
      body: d.reason.slice(0, 200),
      href: "/don-tu",
      entityId: r.id,
    });
  }
  revalidatePath("/teacher/don-tu");
  revalidatePath("/don-tu");
  revalidatePath("/don-tu/cua-toi");
  return { ok: true, note: r.submittedLate ? "Đơn nộp muộn so với quy định báo trước — quản lý sẽ thấy cờ này." : undefined };
}

const decideSchema = z.object({
  id: z.string().min(1),
  decision: z.enum(["APPROVED", "REJECTED"]),
  note: z.string().max(1000).optional().nullable(),
});

/** Tập cơ sở người này được duyệt đơn — tính một lần cho mỗi lượt gọi. */
export async function approvableCenters(): Promise<Set<string>> {
  const map = await loadCenterMap();
  const allowed = new Set<string>();
  for (const id of [...Object.values(map.byCode).map((c) => c.centerId), HO_CENTER_ID]) {
    if (await checkPermission("hr_attendance:approve", { centerId: id })) allowed.add(id);
  }
  return allowed;
}

export async function decideRequestAction(input: unknown): Promise<Res> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Chưa đăng nhập" };
  const p = decideSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" };
  if (p.data.decision === "REJECTED" && !p.data.note?.trim()) return { ok: false, error: "Nhập lý do từ chối" };
  const allowed = await approvableCenters();
  if (allowed.size === 0) return { ok: false, error: "Không có quyền duyệt đơn" };

  const before = await db.workRequest.findUnique({ where: { id: p.data.id }, select: { status: true, kind: true, centerId: true, requesterId: true, fromDate: true } });
  const r = await decideRequest({
    requestId: p.data.id,
    decision: p.data.decision,
    note: p.data.note ?? null,
    actor: { id: session.user.id, name: session.user.name ?? "Quản lý" },
    canWriteCenter: (c) => allowed.has(c),
  });
  if (!r.ok) return r;

  await writeAudit({
    actor: { id: session.user.id, name: session.user.name ?? "" },
    module: "hr_attendance",
    entityType: "WorkRequest",
    entityId: p.data.id,
    action: p.data.decision === "APPROVED" ? "APPROVE_REQUEST" : "REJECT_REQUEST",
    oldValues: before ? { status: before.status } : undefined,
    newValues: { status: p.data.decision, applied: r.applied, kind: before?.kind, centerId: before?.centerId, fromDate: before?.fromDate ? vnYmd(new Date(before.fromDate.getTime() + 12 * 3_600_000)) : null },
    reason: p.data.note ?? undefined,
  });
  for (const n of r.notify) {
    if (n.userId === session.user.id) continue;
    await notifyStaff({ userIds: [n.userId], dedupeKey: `request.decided:${p.data.id}:${n.userId}`, title: n.title, body: n.body, href: n.href, entityId: p.data.id, reopen: true });
  }
  revalidatePath("/teacher/don-tu");
  revalidatePath("/don-tu");
  revalidatePath("/don-tu/cua-toi");
  revalidatePath("/cham-cong/phan-ca");
  revalidatePath("/cham-cong");
  revalidatePath("/lich");
  return { ok: true, note: r.message };
}
