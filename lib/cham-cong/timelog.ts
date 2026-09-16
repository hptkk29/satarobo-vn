// lib/cham-cong/timelog.ts — GHI LƯỢT QUÉT (L4): vé 120s tiêu nguyên tử → StaffTimeLog → xếp hàng
// tính lại ngày. Luật Q-07: GHI LUÔN + gắn cờ hậu kiểm (thiếu GPS, sai nơi làm, trùng, vượt trần)
// — chỉ từ chối khi vé hỏng/hết hạn/đã dùng hoặc không có điểm chấm.
//
// ⚠️ MỘT NGOẠI LỆ của Q-07, thêm 07/09/2026 cùng lúc chuyển sang QR TĨNH: điểm ĐÃ khai toạ độ và
// ĐÃ bật định vị thì quét ngoài vùng bị TỪ CHỐI, không phải gắn cờ. Lý do: mã tĩnh in ra ai chụp
// cũng quét được, nên định vị là lớp bảo vệ còn lại duy nhất — gắn cờ thôi thì mã tĩnh + cờ =
// không chặn gì cả. Điểm CHƯA khai toạ độ vẫn chạy đúng luật cũ.
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
  /**
   * `null` = LƯỢT CÔNG TÁC — không có điểm chấm nào, và đó là chủ đích.
   *
   * Chốt của chủ dự án (phần A): "KHÔNG mã QR. KHÔNG ghim toạ độ nơi công tác — công tác
   * nhiều nơi, không xác định trước." Người đi công tác bấm hai nút ở màn "Của tôi".
   *
   * ⚠️ ĐÂY LÀ ĐƯỜNG THỨ HAI, KHÔNG phải một nhánh của đường QR. Hai vế đầu của chuỗi kiểm
   * (điểm chấm tồn tại/bật → geofence) KHÔNG áp dụng; ba vế còn lại (độ chính xác GPS,
   * trần lượt/ngày, trùng 2 phút) vẫn chạy y nguyên. `source` phân biệt được ở DB.
   */
  workLocationId: string | null;
  direction: "CHECK_IN" | "CHECK_OUT";
  latitude?: number | null;
  longitude?: number | null;
  accuracyMeters?: number | null;
  ticketId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  source?: "TICKET" | "KIOSK" | "CONG_TAC";
  now?: Date;
};

export type RecordTimeLogResult =
  | { ok: true; logId: string; flags: string[]; workDate: Date; centerId: string }
  | { ok: false; error: string; rejectReason: "NO_WORKLOCATION" | "OUTSIDE_GEOFENCE" | "NO_GPS" };

/** Ghi lượt (ACCEPTED + cờ) rồi xếp hàng tính lại ngày. */
export async function recordTimeLog(input: RecordTimeLogInput): Promise<RecordTimeLogResult> {
  const now = input.now ?? new Date();
  // LƯỢT CÔNG TÁC: `workLocationId = null` ⇒ không tra điểm chấm, và hai vế kiểm đầu tiên
  // (điểm tồn tại/bật · geofence) không có gì để kiểm. Mọi chỗ dùng `wl` bên dưới đều đã
  // được viết cho `wl == null`.
  const wl = input.workLocationId
    ? await db.workLocation.findUnique({
        where: { id: input.workLocationId },
        select: { id: true, centerId: true, orgUnitId: true, latitude: true, longitude: true, radiusMeters: true, geofenceEnabled: true, isActive: true, name: true },
      })
    : null;
  if (input.workLocationId && (!wl || !wl.isActive)) {
    return { ok: false, error: "Điểm chấm công không tồn tại hoặc đã tắt", rejectReason: "NO_WORKLOCATION" };
  }

  const workDate = vnDateOnly(now);
  const home = await resolveHomeCenter(input.userId);
  const assignment = await db.shiftAssignment.findFirst({
    where: { userId: input.userId, workDate, status: "ACTIVE" },
    select: { centerId: true, orgUnitId: true, placeMode: true, allowedOrgUnitIds: true, templateCode: true },
  });
  const orgUnitId = wl?.orgUnitId ?? assignment?.orgUnitId ?? null;
  const [maxLogs, dupMinutes] = await Promise.all([getSetting("shift.maxLogsPerDay", { orgUnitId }), getSetting("shift.duplicateTapMinutes", { orgUnitId })]);

  const flags = new Set<string>();
  let dist: number | null = null;
  let within: boolean | null = null;
  if (wl == null) {
    // CÔNG TÁC — không có điểm chấm nên KHÔNG có gì để đo khoảng cách. Toạ độ vẫn được LƯU
    // (cột `latitude`/`longitude` bên dưới); chỉ `distanceMeters`/`withinGeofence` là null.
    //
    // KHÔNG CHẶN khi thiếu GPS — chốt của chủ dự án: "Người ở chỗ sóng kém mà không chấm
    // được là hỏng đúng mục đích." Chỉ gắn cờ để quản lý rà.
    if (input.latitude == null || input.longitude == null) flags.add("THIEU_GPS");
    else if ((input.accuracyMeters ?? 0) > 200) flags.add("GPS_KEM_CHINH_XAC");
  } else if (wl.latitude == null || wl.longitude == null) {
    flags.add("CHUA_TOA_DO");
  } else if (input.latitude == null || input.longitude == null) {
    flags.add("THIEU_GPS");
  } else {
    dist = distanceMeters(input.latitude, input.longitude, wl.latitude, wl.longitude);
    within = dist <= wl.radiusMeters;
    if (wl.geofenceEnabled && !within) flags.add("NGOAI_VUNG");
    if ((input.accuracyMeters ?? 0) > 200) flags.add("GPS_KEM_CHINH_XAC");
  }

  // ── CHẶN khi ngoài vùng (chốt chủ dự án 06/09, đi cùng QR TĨNH) ────────────────────────
  //
  // Đảo luật Q-07 cũ ("ghi luôn + gắn cờ") cho ĐÚNG một trường hợp, và chỉ vì QR đổi thiết kế:
  // mã tĩnh in ra dán ở quầy thì ai chụp ảnh cũng quét được, nên định vị là lớp bảo vệ CÒN LẠI
  // duy nhất. Gắn cờ thôi thì mã tĩnh + cờ = không chặn gì cả.
  //
  // CHẶN CÓ ĐIỀU KIỆN — chỉ ở điểm ĐÃ KHAI TOẠ ĐỘ và ĐÃ BẬT định vị. Chặn vô điều kiện là
  // khoá cửa cả công ty: `geofenceEnabled` mặc định `false` và toạ độ mặc định `null`, nên
  // điểm chưa đo thực địa sẽ từ chối mọi người. Điểm chưa khai vẫn chạy như cũ (ghi + cờ
  // `CHUA_TOA_DO`), và màn Điểm chấm công nói rõ điểm nào chưa chặn được.
  //
  // Người bị chặn nhầm KHÔNG kẹt: đơn chỉnh công (`TIMESHEET_FIX`) là đường sửa có sẵn, quản lý
  // duyệt là mốc giờ vào đúng chỗ.
  if (wl != null && wl.geofenceEnabled && wl.latitude != null && wl.longitude != null) {
    if (input.latitude == null || input.longitude == null) {
      return {
        ok: false,
        error: "Không lấy được vị trí. Bật định vị cho trình duyệt rồi quét lại — nếu vẫn không được, nộp đơn chỉnh công.",
        rejectReason: "NO_GPS",
      };
    }
    if (within === false) {
      const xa = dist == null ? "" : ` (cách ${Math.round(dist)}m, cho phép ${wl.radiusMeters}m)`;
      return {
        ok: false,
        error: `Bạn đang ở ngoài phạm vi ${wl.name}${xa}. Tới nơi rồi quét lại — nếu máy định vị sai, nộp đơn chỉnh công.`,
        rejectReason: "OUTSIDE_GEOFENCE",
      };
    }
  }
  // Sai nơi làm (§4.10): chỉ khi ca hôm nay AT_UNITS và điểm chấm không thuộc đơn vị cho phép.
  // `SAI_NOI_LAM` chỉ có nghĩa khi ca ràng buộc NƠI (`AT_UNITS`) và có điểm chấm để so.
  // Ca công tác là `OFFSITE` — không nơi nào để sai — nên nhánh này tự không chạy.
  if (wl != null && assignment && assignment.placeMode === "AT_UNITS") {
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

  // ── `centerId` của lượt — cột NOT NULL ────────────────────────────────────────────────
  //
  // Đường QR: nơi chấm = cơ sở của điểm chấm.
  // Đường CÔNG TÁC: không có điểm chấm. Chủ dự án chốt: "centerId = CƠ SỞ TRỰC THUỘC của
  // người đó (chi phí về nơi họ thuộc về)" ⇒ `resolveHomeCenter`, ĐÚNG hàm mà `recompute`
  // dùng để chốt nơi chịu công, nên hai bên không thể nói khác nhau.
  //
  // ⚠️ KHÔNG dùng `assignment.centerId` dù ô ca `NG` có cột ấy: nó là nơi ca được XẾP, còn
  // câu hỏi ở đây là chi phí về đâu. Với `NG` hai giá trị thường trùng, nhưng "thường
  // trùng" không phải một luật — và chuỗi dự phòng ghi trong chú thích schema
  // ("không WorkLocation thì assignment.centerId, rồi home") CHƯA TỪNG được hiện thực,
  // nên đừng đọc nó như mô tả hành vi.
  const centerId = wl?.centerId ?? home.centerId;
  const log = await db.staffTimeLog.create({
    data: {
      userId: input.userId,
      centerId,
      orgUnitId,
      workLocationId: wl?.id ?? null,
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
