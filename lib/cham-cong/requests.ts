// lib/cham-cong/requests.ts — L5: ĐƠN TỪ DÙNG CHUNG cho mọi nhân sự (GV, tư vấn, giáo vụ, HO) +
// duyệt CÓ HIỆU LỰC THẬT trong một transaction (T-05/T-06/T-07).
//
// Luật cơ sở nhận đơn (kế hoạch v3 §3.2):
//   · Đơn theo NGÀY → cơ sở của ca ACTIVE ngày đó (ShiftAssignment.centerId) — đây là nơi
//     "chịu công", kể cả khi người HO xuống cơ sở làm.
//   · Không có ca → cơ sở nhà (Employee.centerId → User.centerId).
//   · Cơ sở nhà là Hội sở (hoi-so / null) → KHÔNG tự đoán: người nộp phải chọn cơ sở nhận
//     (form hiện ô chọn), vì Hội sở không có Quản lý cơ sở để duyệt.
//   Module chấm công KHÔNG đọc `session.user.centerId` (ảnh chụp JWT lúc login).
//
// Luật duyệt (T-05): "duyệt + áp hệ quả" là MỘT quyết định. Với đơn ca/nghỉ/chỉnh công
// (thứ module này sở hữu) mọi ghi nằm trong `db.$transaction`: lỗi áp ⇒ rollback cả trạng
// thái duyệt, rồi ghi `applyError` ở giao dịch riêng để người duyệt thấy vì sao. Với đơn lớp
// (CLASS_OFF/SUB_TEACH) hệ quả nằm ở `lib/classes/adjust.ts` — hàm đó tự mở transaction của
// nó, nên ở đây làm BÙ TRỪ: áp thất bại ⇒ trả đơn về PENDING + applyError. Kết quả nhìn từ
// ngoài như nhau: không bao giờ có đơn APPROVED mà lịch chưa đổi.
//
// Không "use server" — action ở app/ kiểm quyền (`hr_attendance:approve` theo cơ sở nhận
// đơn) rồi mới gọi vào đây.
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getSetting } from "@/lib/settings/service";
import { vnAddDays, vnDateOnly, vnYmd } from "@/lib/time/vn";
import { HO_CENTER_ID, loadCenterMap, resolveHomeCenter } from "./home-center";
import { setAssignmentCell, type CellDb } from "./cells";
import { markAttendanceDayDirty } from "./recompute";
import { applyApprovedWorkRequest } from "@/lib/work-request-apply";
import { WR_KIND_LABEL, isClassKind, isRangeKind, type WorkRequestKindV } from "@/lib/work-request";

// ─── Cơ sở nhận đơn ───────────────────────────────────────────────────────────────────

export type RequestCenterResolution = {
  /** null = Hội sở, người nộp phải chọn. */
  centerId: string | null;
  /** Vì sao ra cơ sở đó — hiện cho người nộp thấy để bớt thắc mắc. */
  via: "ASSIGNMENT" | "HOME" | "HO";
  homeUnit: string; // "CS1" | "CS2" | "HO"
  timesheetExempt: boolean;
};

export async function resolveRequestCenter(userId: string, onDate: Date | null): Promise<RequestCenterResolution> {
  const home = await resolveHomeCenter(userId);
  if (onDate) {
    const a = await db.shiftAssignment.findFirst({
      where: { userId, workDate: vnDateOnly(onDate), status: "ACTIVE" },
      select: { centerId: true },
    });
    if (a && a.centerId !== HO_CENTER_ID) {
      return { centerId: a.centerId, via: "ASSIGNMENT", homeUnit: home.centerCode, timesheetExempt: home.timesheetExempt };
    }
  }
  if (home.isHo) return { centerId: null, via: "HO", homeUnit: "HO", timesheetExempt: home.timesheetExempt };
  return { centerId: home.centerId, via: "HOME", homeUnit: home.centerCode, timesheetExempt: home.timesheetExempt };
}

/** Nộp muộn = ngày áp dụng cách hôm nay ít hơn `shift.requestNoticeDays` ngày (tính theo giờ VN). */
export function isSubmittedLate(fromDate: Date, now: Date, noticeDays: number): boolean {
  const today = vnDateOnly(now);
  const deadline = vnDateOnly(vnAddDays(now, noticeDays));
  const target = vnDateOnly(fromDate);
  if (target < today) return true; // đơn hồi tố luôn là muộn
  return target < deadline;
}

// ─── Nộp đơn ──────────────────────────────────────────────────────────────────────────

export type SubmitRequestInput = {
  requesterId: string;
  kind: WorkRequestKindV;
  fromDate: Date | null;
  toDate: Date | null;
  startTime: string | null;
  endTime: string | null;
  hours: number | null;
  className: string | null;
  classId: string | null;
  targetUserId: string | null;
  requesterNewTemplateId: string | null;
  targetNewTemplateId: string | null;
  leaveTypeId: string | null;
  requestedInAt: string | null;
  requestedOutAt: string | null;
  /** Người HO chọn tay; bỏ qua nếu hệ thống tự suy ra được. */
  chosenCenterId: string | null;
  detail: string | null;
  reason: string;
  now?: Date;
};

export type SubmitRequestResult =
  | { ok: true; id: string; centerId: string; submittedLate: boolean }
  | { ok: false; error: string };

export async function submitAttendanceRequest(input: SubmitRequestInput): Promise<SubmitRequestResult> {
  const now = input.now ?? new Date();
  const from = input.fromDate ? vnDateOnly(input.fromDate) : null;
  const to = isRangeKind(input.kind) ? (input.toDate ? vnDateOnly(input.toDate) : from) : from;
  if (from && to && to < from) return { ok: false, error: "Đến ngày phải sau Từ ngày" };
  if (isRangeKind(input.kind) && from && to && (to.getTime() - from.getTime()) / 86_400_000 > 62) {
    return { ok: false, error: "Đơn khoảng ngày tối đa 62 ngày — tách đơn nếu nghỉ dài hơn" };
  }
  if (input.kind === "TIMESHEET_FIX" && !input.requestedInAt && !input.requestedOutAt && input.hours == null) {
    return { ok: false, error: "Chỉnh công cần ít nhất giờ vào hoặc giờ ra đề nghị" };
  }
  if (input.kind === "SHIFT_SWAP" && !input.requesterNewTemplateId) {
    return { ok: false, error: "Đổi ca cần chọn mã ca mới" };
  }
  if (input.kind === "LEAVE" && !input.leaveTypeId) {
    return { ok: false, error: "Chọn loại nghỉ" };
  }
  if (input.targetUserId && input.targetUserId === input.requesterId) {
    return { ok: false, error: "Người thay không thể là chính bạn" };
  }

  const resolved = await resolveRequestCenter(input.requesterId, from);
  if (resolved.timesheetExempt && !isClassKind(input.kind)) {
    return { ok: false, error: "Bạn thuộc diện miễn chấm công — không cần nộp đơn ca/nghỉ/chỉnh công" };
  }
  let centerId = resolved.centerId;
  if (!centerId) {
    if (!input.chosenCenterId || input.chosenCenterId === HO_CENTER_ID) {
      return { ok: false, error: "Bạn thuộc Hội sở — chọn cơ sở nhận đơn (nơi Quản lý cơ sở sẽ duyệt)" };
    }
    const map = await loadCenterMap();
    if (!Object.values(map.byCode).some((c) => c.centerId === input.chosenCenterId)) {
      return { ok: false, error: "Cơ sở nhận đơn không hợp lệ" };
    }
    centerId = input.chosenCenterId;
  }

  const noticeDays = await getSetting("shift.requestNoticeDays");
  const submittedLate = from ? isSubmittedLate(from, now, noticeDays) : false;

  // Kỳ đã khoá thì không nhận đơn hồi tố (chỉnh công/nghỉ) — sổ đã chốt, mở lại là việc SUPER_ADMIN.
  if (from && !isClassKind(input.kind)) {
    const locked = await db.attendancePeriod.findFirst({
      where: { centerId, status: "LOCKED", periodKey: { in: periodKeysBetween(from, to ?? from) } },
      select: { periodKey: true },
    });
    if (locked) return { ok: false, error: `Kỳ ${locked.periodKey} đã chốt sổ — không nhận đơn cho ngày trong kỳ này` };
  }

  // Đơn trùng: cùng người, cùng loại, cùng ngày, đang chờ ⇒ chặn (bấm hai lần / hai tab).
  if (from) {
    const dup = await db.workRequest.findFirst({
      where: { requesterId: input.requesterId, kind: input.kind, fromDate: from, status: "PENDING" },
      select: { id: true },
    });
    if (dup) return { ok: false, error: "Bạn đã có một đơn cùng loại cho ngày này đang chờ duyệt" };
  }

  const assignment = from
    ? await db.shiftAssignment.findFirst({ where: { userId: input.requesterId, workDate: from, status: "ACTIVE" }, select: { id: true } })
    : null;
  const map = await loadCenterMap();
  const orgUnitId = Object.values(map.byCode).find((c) => c.centerId === centerId)?.orgUnitId ?? null;

  const created = await db.workRequest.create({
    data: {
      requesterId: input.requesterId,
      centerId,
      orgUnitId,
      kind: input.kind,
      fromDate: from,
      toDate: to,
      startTime: input.startTime || null,
      endTime: input.endTime || null,
      hours: input.hours,
      className: isClassKind(input.kind) ? input.className : null,
      classId: isClassKind(input.kind) ? input.classId : null,
      targetUserId: input.kind === "SUB_TEACH" || input.kind === "SHIFT_SWAP" || input.kind === "LEAVE" ? input.targetUserId : null,
      assignmentId: assignment?.id ?? null,
      requesterNewTemplateId: input.kind === "SHIFT_SWAP" ? input.requesterNewTemplateId : null,
      targetNewTemplateId: input.kind === "SHIFT_SWAP" || input.kind === "LEAVE" ? input.targetNewTemplateId : null,
      leaveTypeId: input.kind === "LEAVE" ? input.leaveTypeId : null,
      requestedInAt: input.kind === "TIMESHEET_FIX" ? input.requestedInAt : null,
      requestedOutAt: input.kind === "TIMESHEET_FIX" ? input.requestedOutAt : null,
      submittedLate,
      detail: input.detail,
      reason: input.reason,
    },
    select: { id: true },
  });
  return { ok: true, id: created.id, centerId, submittedLate };
}

export function periodKeysBetween(from: Date, to: Date): string[] {
  const out = new Set<string>();
  for (let d = new Date(from); d <= to; d = new Date(d.getTime() + 86_400_000)) out.add(vnYmd(new Date(d.getTime() + 12 * 3_600_000)).slice(0, 7));
  return [...out];
}

// ─── Duyệt / từ chối ──────────────────────────────────────────────────────────────────

export type DecideInput = {
  requestId: string;
  decision: "APPROVED" | "REJECTED";
  note: string | null;
  actor: { id: string; name: string };
  /** Quyền GHI ca theo cơ sở — action tính sẵn từ `hr_attendance:approve`. */
  canWriteCenter: (centerId: string) => boolean;
  now?: Date;
};

export type DecideNotify = { userId: string; title: string; body: string; href: string };
export type DecideResult =
  | { ok: true; applied: boolean; message?: string; notify: DecideNotify[] }
  | { ok: false; error: string };

const REQ_SELECT = {
  id: true,
  requesterId: true,
  centerId: true,
  kind: true,
  status: true,
  fromDate: true,
  toDate: true,
  classId: true,
  targetUserId: true,
  requesterNewTemplateId: true,
  targetNewTemplateId: true,
  leaveTypeId: true,
  requestedInAt: true,
  requestedOutAt: true,
  reason: true,
} as const;

export async function decideRequest(input: DecideInput): Promise<DecideResult> {
  const now = input.now ?? new Date();
  const req = await db.workRequest.findUnique({ where: { id: input.requestId }, select: REQ_SELECT });
  if (!req) return { ok: false, error: "Không tìm thấy đơn" };
  if (req.status !== "PENDING") return { ok: false, error: "Đơn đã được xử lý" };
  if (!req.centerId || !input.canWriteCenter(req.centerId)) return { ok: false, error: "Đơn thuộc cơ sở bạn không có quyền duyệt" };

  const decisionData = {
    status: input.decision,
    reviewedById: input.actor.id,
    reviewedByName: input.actor.name,
    reviewedAt: now,
    reviewNote: input.note?.trim() || null,
  };
  const kindLabel = WR_KIND_LABEL[req.kind as WorkRequestKindV] ?? req.kind;
  const dateLabel = req.fromDate ? vnYmd(new Date(req.fromDate.getTime() + 12 * 3_600_000)) : "";
  const requesterHref = "/don-tu/cua-toi";

  // ── Từ chối: chỉ đổi trạng thái (khoá lạc quan). ──
  if (input.decision === "REJECTED") {
    const r = await db.workRequest.updateMany({ where: { id: req.id, status: "PENDING" }, data: decisionData });
    if (r.count === 0) return { ok: false, error: "Đơn vừa được người khác xử lý" };
    return {
      ok: true,
      applied: false,
      notify: [{ userId: req.requesterId, title: `Đơn ${kindLabel} ${dateLabel} bị từ chối`, body: `${input.actor.name} từ chối đơn của bạn${input.note ? ` — ${input.note}` : ""}.`, href: requesterHref }],
    };
  }

  // ── Duyệt đơn LỚP: hệ quả nằm ngoài tx của module ⇒ bù trừ. ──
  if (isClassKind(req.kind as WorkRequestKindV)) {
    const r = await db.workRequest.updateMany({ where: { id: req.id, status: "PENDING" }, data: decisionData });
    if (r.count === 0) return { ok: false, error: "Đơn vừa được người khác xử lý" };
    let message: string | undefined;
    let applied: boolean;
    try {
      const res = await applyApprovedWorkRequest({
        request: { id: req.id, kind: req.kind, classId: req.classId, fromDate: req.fromDate, targetUserId: req.targetUserId, reason: req.reason, requesterId: req.requesterId },
        actorId: input.actor.id,
        actorName: input.actor.name,
      });
      applied = res.applied;
      message = res.message;
      if (req.kind !== "CLASS_CHANGE" && !res.applied) throw new Error(res.message ?? "Không áp được lên lịch");
      await db.workRequest.update({ where: { id: req.id }, data: { appliedAt: res.applied ? now : null, applyError: null } });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Bù trừ: trả về PENDING để không có đơn "đã duyệt" mà lịch chưa đổi (T-05).
      await db.workRequest.update({
        where: { id: req.id },
        data: { status: "PENDING", reviewedById: null, reviewedByName: null, reviewedAt: null, reviewNote: null, applyError: msg.slice(0, 500) },
      });
      return { ok: false, error: `Chưa duyệt được — không áp lên lịch: ${msg}` };
    }
    return {
      ok: true,
      applied,
      message,
      notify: [{ userId: req.requesterId, title: `Đơn ${kindLabel} ${dateLabel} đã duyệt`, body: `${input.actor.name} đã duyệt${message ? ` — ${message}` : ""}.`, href: requesterHref }],
    };
  }

  // ── Duyệt đơn CA / NGHỈ / CHỈNH CÔNG: mọi ghi trong MỘT transaction. ──
  const map = await loadCenterMap();
  const notify: DecideNotify[] = [];
  try {
    const out = await db.$transaction(async (tx) => {
      const lock = await tx.workRequest.updateMany({ where: { id: req.id, status: "PENDING" }, data: { ...decisionData, appliedAt: now, applyError: null } });
      if (lock.count === 0) throw new DecideError("Đơn vừa được người khác xử lý");

      const cellDb = tx as unknown as CellDb;
      const messages: string[] = [];

      if (req.kind === "SHIFT_SWAP") {
        if (!req.fromDate) throw new DecideError("Đơn thiếu ngày");
        const newCode = await templateCode(tx, req.requesterNewTemplateId);
        if (!newCode) throw new DecideError("Mã ca mới không còn trong danh mục");
        const home = await resolveHomeCenter(req.requesterId);
        const r = await setAssignmentCell({ db: cellDb, tx, userId: req.requesterId, workDate: req.fromDate, code: newCode, homeUnit: home.centerCode, centerMap: map, source: "SWAP", sourceRequestId: req.id, note: `Đơn đổi ca ${req.id}`, actorUserId: input.actor.id, canWriteCenter: input.canWriteCenter });
        if (r.error) throw new DecideError(r.error);
        messages.push(`Ca của người nộp ${dateLabel}: ${r.before?.templateCode ?? "—"} → ${newCode}`);
        notify.push({ userId: req.requesterId, title: `Ca ${dateLabel} đổi: ${r.before?.templateCode ?? "—"} → ${newCode}`, body: `${input.actor.name} đã duyệt đơn đổi ca của bạn.`, href: "/cham-cong/lich-ca" });
        if (req.targetUserId && req.targetNewTemplateId) {
          const tCode = await templateCode(tx, req.targetNewTemplateId);
          if (!tCode) throw new DecideError("Mã ca của người nhận thay không còn trong danh mục");
          const tHome = await resolveHomeCenter(req.targetUserId);
          const r2 = await setAssignmentCell({ db: cellDb, tx, userId: req.targetUserId, workDate: req.fromDate, code: tCode, homeUnit: tHome.centerCode, centerMap: map, source: "SWAP", sourceRequestId: req.id, note: `Nhận ca theo đơn ${req.id}`, actorUserId: input.actor.id, canWriteCenter: input.canWriteCenter });
          if (r2.error) throw new DecideError(`Người nhận ca: ${r2.error}`);
          messages.push(`Ca người nhận: ${r2.before?.templateCode ?? "—"} → ${tCode}`);
          notify.push({ userId: req.targetUserId, title: `Bạn nhận ca ${dateLabel}: ${r2.before?.templateCode ?? "—"} → ${tCode}`, body: `${input.actor.name} duyệt đơn đổi ca — bạn nhận ca thay.`, href: "/cham-cong/lich-ca" });
        }
      } else if (req.kind === "LEAVE") {
        if (!req.fromDate) throw new DecideError("Đơn thiếu ngày");
        const to = req.toDate ?? req.fromDate;
        const lt = req.leaveTypeId ? await tx.leaveType.findUnique({ where: { id: req.leaveTypeId }, select: { code: true, paidRatio: true, isActive: true } }) : null;
        // Mã ca ghi lên lưới: nghỉ có lương ⇒ "P", không lương ⇒ "X" (mã Sheet — K-06 theo MISA).
        const code = lt && lt.paidRatio > 0 ? "P" : "X";
        const home = await resolveHomeCenter(req.requesterId);
        let n = 0;
        for (let d = new Date(req.fromDate); d <= to; d = new Date(d.getTime() + 86_400_000)) {
          const r = await setAssignmentCell({ db: cellDb, tx, userId: req.requesterId, workDate: d, code, homeUnit: home.centerCode, centerMap: map, source: "LEAVE", sourceRequestId: req.id, note: lt ? `Nghỉ ${lt.code}` : "Nghỉ", actorUserId: input.actor.id, canWriteCenter: input.canWriteCenter });
          if (r.error) throw new DecideError(`${vnYmd(new Date(d.getTime() + 12 * 3_600_000))}: ${r.error}`);
          n += 1;
        }
        messages.push(`Đã ghi ${code} cho ${n} ngày`);
        notify.push({ userId: req.requesterId, title: `Đơn nghỉ ${dateLabel} đã duyệt`, body: `${input.actor.name} đã duyệt — ${n} ngày ghi mã ${code}.`, href: "/cham-cong/lich-ca" });
        if (req.targetUserId && req.targetNewTemplateId) {
          const tCode = await templateCode(tx, req.targetNewTemplateId);
          if (!tCode) throw new DecideError("Mã ca của người làm thay không còn trong danh mục");
          const tHome = await resolveHomeCenter(req.targetUserId);
          const r2 = await setAssignmentCell({ db: cellDb, tx, userId: req.targetUserId, workDate: req.fromDate, code: tCode, homeUnit: tHome.centerCode, centerMap: map, source: "SWAP", sourceRequestId: req.id, note: `Làm thay theo đơn nghỉ ${req.id}`, actorUserId: input.actor.id, canWriteCenter: input.canWriteCenter });
          if (r2.error) throw new DecideError(`Người làm thay: ${r2.error}`);
          notify.push({ userId: req.targetUserId, title: `Bạn làm thay ${dateLabel}: ca ${tCode}`, body: `${input.actor.name} duyệt đơn nghỉ — bạn làm thay ca ${tCode}.`, href: "/cham-cong/lich-ca" });
        }
      } else if (req.kind === "TIMESHEET_FIX") {
        if (!req.fromDate) throw new DecideError("Đơn thiếu ngày");
        const home = await resolveHomeCenter(req.requesterId);
        const a = await tx.shiftAssignment.findFirst({ where: { userId: req.requesterId, workDate: req.fromDate, status: "ACTIVE" }, select: { centerId: true, orgUnitId: true } });
        const centerId = a?.centerId ?? req.centerId ?? home.centerId;
        if (!input.canWriteCenter(centerId)) throw new DecideError("Không có quyền chỉnh công ở cơ sở này");
        const orgUnitId = a?.orgUnitId ?? Object.values(map.byCode).find((c) => c.centerId === centerId)?.orgUnitId ?? null;
        const rows: Prisma.StaffTimeLogCreateManyInput[] = [];
        for (const [dir, hhmm] of [["CHECK_IN", req.requestedInAt], ["CHECK_OUT", req.requestedOutAt]] as const) {
          if (!hhmm) continue;
          const at = vnTimeOn(req.fromDate, hhmm);
          if (!at) throw new DecideError(`Giờ "${hhmm}" không hợp lệ`);
          rows.push({ userId: req.requesterId, centerId, orgUnitId, direction: dir, loggedAt: at, workDate: req.fromDate, source: "MANUAL_ADJUST", result: "ACCEPTED", reviewStatus: "CONFIRMED", reviewedById: input.actor.id, reviewedAt: now, reviewNote: input.note?.trim() || null, adjustRequestId: req.id, flags: ["CHINH_TAY"] });
        }
        if (rows.length === 0) throw new DecideError("Đơn không có giờ vào/ra để ghi");
        await tx.staffTimeLog.createMany({ data: rows });
        await markAttendanceDayDirty(req.requesterId, req.fromDate, { tx, reason: "TIMESHEET_FIX" });
        messages.push(`Đã ghi ${rows.length} mốc giờ chỉnh tay cho ${dateLabel}`);
        notify.push({ userId: req.requesterId, title: `Đơn chỉnh công ${dateLabel} đã duyệt`, body: `${input.actor.name} đã ghi ${rows.map((r) => (r.direction === "CHECK_IN" ? `vào ${req.requestedInAt}` : `ra ${req.requestedOutAt}`)).join(", ")}.`, href: requesterHref });
      } else {
        // OT / LATE_EARLY / REMOTE / BUSINESS_TRIP: đơn là căn cứ, không đổi lưới (đi muộn/về sớm
        // đã duyệt thì engine vẫn ghi cờ; Quản lý ghi đè công ở bảng công ngày nếu cần).
        notify.push({ userId: req.requesterId, title: `Đơn ${kindLabel} ${dateLabel} đã duyệt`, body: `${input.actor.name} đã duyệt đơn của bạn${input.note ? ` — ${input.note}` : ""}.`, href: requesterHref });
      }
      return { messages };
    });
    return { ok: true, applied: out.messages.length > 0, message: out.messages.join(" · ") || undefined, notify };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Ghi applyError SAU rollback, ở giao dịch riêng (T-05) — đơn vẫn PENDING.
    await db.workRequest.updateMany({ where: { id: req.id, status: "PENDING" }, data: { applyError: msg.slice(0, 500) } });
    return { ok: false, error: err instanceof DecideError ? msg : `Chưa duyệt được — lỗi áp hệ quả: ${msg}` };
  }
}

// ─── Người duyệt của một cơ sở ─────────────────────────────────────────────────────────

/**
 * User giữ vai có `hr_attendance:approve` neo TẠI đơn vị của cơ sở hoặc đơn vị tổ tiên (HO/REGION).
 * Đọc UserOrgRole ACTIVE còn hiệu lực — nguồn quyền là DB (luật cứng #6), không đọc JWT.
 */
export async function approversOfCenter(centerId: string): Promise<string[]> {
  const unit = await db.orgUnit.findFirst({ where: { centerId }, select: { id: true, path: true } });
  if (!unit) return [];
  const ancestors = unit.path
    ? await db.orgUnit.findMany({ where: { OR: unit.path.split("/").filter(Boolean).map((_, i, arr) => ({ path: "/" + arr.slice(0, i + 1).join("/") + "/" })) }, select: { id: true } })
    : [];
  const unitIds = [...new Set([unit.id, ...ancestors.map((a) => a.id)])];
  const now = new Date();
  const rows = await db.userOrgRole.findMany({
    where: {
      orgUnitId: { in: unitIds },
      status: "ACTIVE",
      effectiveFrom: { lte: now },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }],
      role: { permissions: { some: { action: "hr_attendance:approve" } } },
    },
    select: { userId: true },
    take: 50,
  });
  return [...new Set(rows.map((r) => r.userId))];
}

class DecideError extends Error {}

async function templateCode(tx: Prisma.TransactionClient, id: string | null): Promise<string | null> {
  if (!id) return null;
  const t = await tx.shiftTemplate.findFirst({ where: { id, isActive: true }, select: { code: true } });
  return t?.code ?? null;
}

/** "HH:mm" trên một ngày công (giờ VN) → thời điểm tuyệt đối. */
export function vnTimeOn(workDate: Date, hhmm: string): Date | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (h > 23 || mi > 59) return null;
  return new Date(Date.UTC(workDate.getUTCFullYear(), workDate.getUTCMonth(), workDate.getUTCDate(), h - 7, mi));
}
