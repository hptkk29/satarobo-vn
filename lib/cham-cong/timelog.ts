// lib/cham-cong/timelog.ts — GHI LƯỢT QUÉT (L4): vé 120s tiêu nguyên tử → StaffTimeLog → xếp hàng
// tính lại ngày. Luật Q-07: GHI LUÔN + gắn cờ hậu kiểm (ngoài vùng, thiếu GPS, sai nơi làm, trùng,
// vượt trần) — chỉ từ chối khi vé hỏng/hết hạn/đã dùng hoặc không có điểm chấm.
// Không "use server": action ở app/ (auth + quyền) gọi vào.
import { createHash, randomBytes } from "crypto";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getSetting } from "@/lib/settings/service";
import { vnDateOnly } from "@/lib/time/vn";
import { distanceMeters } from "@/lib/attendance/geofence";
import { resolveHomeCenter } from "./home-center";
import { markAttendanceDayDirty } from "./recompute";

export const TICKET_TTL_MS = 120_000;

function hashNonce(nonce: string): string {
  return createHash("sha256").update(nonce).digest("hex");
}

/** Cấp vé cho NGƯỜI đã quét mã kiosk hợp lệ. Vé sống 120s, dùng một lần. */
export async function issueTicket(input: { userId: string; workLocationId: string; ip?: string | null; deviceId?: string | null }) {
  const nonce = randomBytes(18).toString("base64url");
  const t = await db.attendanceTicket.create({
    data: {
      userId: input.userId,
      workLocationId: input.workLocationId,
      nonceHash: hashNonce(nonce),
      expiresAt: new Date(Date.now() + TICKET_TTL_MS),
      ip: input.ip ?? null,
      deviceId: input.deviceId ?? null,
    },
    select: { id: true, expiresAt: true },
  });
  return { ticketId: t.id, nonce, expiresAt: t.expiresAt };
}

export type ConsumeResult = { ok: true; workLocationId: string } | { ok: false; reason: "TICKET_INVALID" | "TICKET_EXPIRED" | "TICKET_REUSED" };

/** Tiêu vé NGUYÊN TỬ: UPDATE … WHERE consumedAt IS NULL AND expiresAt > now(). Fail-closed. */
export async function consumeTicket(input: { ticketId: string; nonce: string; userId: string }): Promise<ConsumeResult> {
  const t = await db.attendanceTicket.findUnique({ where: { id: input.ticketId }, select: { userId: true, nonceHash: true, expiresAt: true, consumedAt: true, workLocationId: true } });
  if (!t || t.userId !== input.userId || t.nonceHash !== hashNonce(input.nonce)) return { ok: false, reason: "TICKET_INVALID" };
  if (t.consumedAt) return { ok: false, reason: "TICKET_REUSED" };
  if (t.expiresAt.getTime() <= Date.now()) return { ok: false, reason: "TICKET_EXPIRED" };
  const r = await db.attendanceTicket.updateMany({ where: { id: input.ticketId, consumedAt: null, expiresAt: { gt: new Date() } }, data: { consumedAt: new Date() } });
  if (r.count !== 1) return { ok: false, reason: "TICKET_REUSED" };
  return { ok: true, workLocationId: t.workLocationId };
}

export type RecordTimeLogInput = {
  userId: string;
  workLocationId: string;
  direction: "CHECK_IN" | "CHECK_OUT";
  latitude?: number | null;
  longitude?: number | null;
  accuracyMeters?: number | null;
  ticketId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  source?: "TICKET" | "KIOSK";
  now?: Date;
};

export type RecordTimeLogResult =
  | { ok: true; logId: string; flags: string[]; workDate: Date; centerId: string }
  | { ok: false; error: string; rejectReason: "NO_WORKLOCATION" };

/** Ghi lượt (ACCEPTED + cờ) rồi xếp hàng tính lại ngày. */
export async function recordTimeLog(input: RecordTimeLogInput): Promise<RecordTimeLogResult> {
  const now = input.now ?? new Date();
  const wl = await db.workLocation.findUnique({
    where: { id: input.workLocationId },
    select: { id: true, centerId: true, orgUnitId: true, latitude: true, longitude: true, radiusMeters: true, geofenceEnabled: true, isActive: true, name: true },
  });
  if (!wl || !wl.isActive) return { ok: false, error: "Điểm chấm công không tồn tại hoặc đã tắt", rejectReason: "NO_WORKLOCATION" };

  const workDate = vnDateOnly(now);
  const home = await resolveHomeCenter(input.userId);
  const assignment = await db.shiftAssignment.findFirst({
    where: { userId: input.userId, workDate, status: "ACTIVE" },
    select: { centerId: true, orgUnitId: true, placeMode: true, allowedOrgUnitIds: true, templateCode: true },
  });
  const orgUnitId = wl.orgUnitId ?? assignment?.orgUnitId ?? null;
  const [maxLogs, dupMinutes] = await Promise.all([getSetting("shift.maxLogsPerDay", { orgUnitId }), getSetting("shift.duplicateTapMinutes", { orgUnitId })]);

  const flags = new Set<string>();
  let dist: number | null = null;
  let within: boolean | null = null;
  if (wl.latitude == null || wl.longitude == null) {
    flags.add("CHUA_TOA_DO");
  } else if (input.latitude == null || input.longitude == null) {
    flags.add("THIEU_GPS");
  } else {
    dist = distanceMeters(input.latitude, input.longitude, wl.latitude, wl.longitude);
    within = dist <= wl.radiusMeters;
    if (wl.geofenceEnabled && !within) flags.add("NGOAI_VUNG");
    if ((input.accuracyMeters ?? 0) > 200) flags.add("GPS_KEM_CHINH_XAC");
  }
  // Sai nơi làm (§4.10): chỉ khi ca hôm nay AT_UNITS và điểm chấm không thuộc đơn vị cho phép.
  if (assignment && assignment.placeMode === "AT_UNITS") {
    const allowed = assignment.allowedOrgUnitIds;
    const okUnit = allowed.length > 0 && wl.orgUnitId ? allowed.includes(wl.orgUnitId) : assignment.centerId === wl.centerId;
    if (!okUnit) flags.add("SAI_NOI_LAM");
  }
  if (!assignment) flags.add("CHAM_NGOAI_LICH");

  const todays = await db.staffTimeLog.findMany({
    where: { userId: input.userId, workDate, result: "ACCEPTED" },
    orderBy: { loggedAt: "desc" },
    select: { direction: true, loggedAt: true },
  });
  if (todays.length >= maxLogs) flags.add("VUOT_TRAN");
  const last = todays[0];
  if (last && last.direction === input.direction && now.getTime() - last.loggedAt.getTime() < dupMinutes * 60_000) flags.add("TRUNG_2_PHUT");

  const centerId = wl.centerId;
  const log = await db.staffTimeLog.create({
    data: {
      userId: input.userId,
      centerId,
      orgUnitId,
      workLocationId: wl.id,
      direction: input.direction,
      loggedAt: now,
      workDate,
      source: input.source ?? "TICKET",
      result: "ACCEPTED",
      flags: [...flags].sort(),
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
      accuracyMeters: input.accuracyMeters ?? null,
      distanceMeters: dist,
      withinGeofence: within,
      ticketId: input.ticketId ?? null,
      ip: input.ip ?? null,
      userAgent: input.userAgent?.slice(0, 300) ?? null,
    } satisfies Prisma.StaffTimeLogUncheckedCreateInput,
    select: { id: true },
  });
  void home;
  await markAttendanceDayDirty(input.userId, workDate, { reason: "timelog" });
  return { ok: true, logId: log.id, flags: [...flags].sort(), workDate, centerId };
}

/** Ghi lượt bị TỪ CHỐI (vé hỏng…) để hậu kiểm — không tính công, không xếp hàng. */
export async function recordRejectedLog(input: { userId: string; workLocationId: string | null; direction: "CHECK_IN" | "CHECK_OUT"; reason: string; ip?: string | null; centerId?: string | null }) {
  const now = new Date();
  const home = await resolveHomeCenter(input.userId);
  const wl = input.workLocationId ? await db.workLocation.findUnique({ where: { id: input.workLocationId }, select: { centerId: true, orgUnitId: true } }) : null;
  await db.staffTimeLog.create({
    data: {
      userId: input.userId,
      centerId: wl?.centerId ?? input.centerId ?? home.centerId,
      orgUnitId: wl?.orgUnitId ?? null,
      workLocationId: input.workLocationId,
      direction: input.direction,
      loggedAt: now,
      workDate: vnDateOnly(now),
      source: "TICKET",
      result: "REJECTED",
      rejectReason: input.reason,
      ip: input.ip ?? null,
    },
  });
}
