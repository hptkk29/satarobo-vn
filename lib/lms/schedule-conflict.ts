import "server-only";
import { db } from "@/lib/db";
import { detectScheduleConflict, type Slot } from "@/lib/lms/scheduling";

// =============================================================================
// LMS-6 — nối detectScheduleConflict vào write-path: 1 buổi candidate có trùng
// PHÒNG / GIÁO VIÊN với buổi khác cùng ngày không.
//   • cửa sổ buổi = [date, date + (endTime-startTime của lớp)] (fallback 90').
//   • phòng/GV hiệu lực của buổi ĐỐI CHIẾU = substitute ?? actual ?? cấp buổi ?? lớp.
//
// T4.2 — module conflict DUY NHẤT: mọi write-path (sinh / đổi 1 buổi / dời cả lớp /
// xếp bù) đi qua đây. Bản cũ `findScheduleConflicts` (lib/classes/generate.ts) chỉ so
// GV/phòng CẤP LỚP nên bỏ sót lớp khác có dạy-thay / đổi phòng ⇒ ĐÃ GỠ BỎ.
// =============================================================================

function parseHHmm(t: string | null | undefined): number | null {
  if (!t) return null;
  const [h, m] = t.split(":").map((x) => parseInt(x, 10));
  if (Number.isNaN(h)) return null;
  return (h || 0) * 60 + (m || 0);
}

/** PURE — cuối buổi từ start (date) + thời lượng lớp; fallback 90'. */
export function sessionWindow(
  date: Date,
  startTime: string | null | undefined,
  endTime: string | null | undefined,
): { startAt: Date; endAt: Date } {
  const s = parseHHmm(startTime);
  const e = parseHHmm(endTime);
  let durMin = 90;
  if (s != null && e != null && e - s > 0) durMin = e - s;
  return { startAt: date, endAt: new Date(date.getTime() + durMin * 60_000) };
}

type SessionRow = {
  id: string;
  date: Date;
  roomId?: string | null;
  actualRoomId: string | null;
  actualTeacherId: string | null;
  substituteRoomId?: string | null;
  substituteTeacherId?: string | null;
  class: {
    roomId: string | null;
    teacherId: string | null;
    startTime: string | null;
    endTime: string | null;
  } | null;
};

/**
 * PURE — quy đổi các buổi (kèm lớp) thành Slot.
 * Phòng: substitute ?? actual ?? phòng CỦA BUỔI (ClassSession.roomId — W2-4b) ?? lớp.
 * GV:    substitute ?? actual ?? lớp.
 */
export function rowsToSlots(rows: SessionRow[]): Slot[] {
  return rows.map((o) => {
    const win = sessionWindow(o.date, o.class?.startTime, o.class?.endTime);
    return {
      id: o.id,
      roomId:
        o.substituteRoomId ?? o.actualRoomId ?? o.roomId ?? o.class?.roomId ?? null,
      teacherId: o.substituteTeacherId ?? o.actualTeacherId ?? o.class?.teacherId ?? null,
      startAt: win.startAt,
      endAt: win.endAt,
    };
  });
}

const SESSION_SELECT = {
  id: true,
  date: true,
  roomId: true,
  actualRoomId: true,
  actualTeacherId: true,
  substituteRoomId: true,
  substituteTeacherId: true,
  class: { select: { roomId: true, teacherId: true, startTime: true, endTime: true } },
} as const;

export type ConflictResult = {
  roomConflict: boolean;
  teacherConflict: boolean;
  conflictIds: string[];
  messages: string[];
};

const EMPTY: ConflictResult = {
  roomConflict: false,
  teacherConflict: false,
  conflictIds: [],
  messages: [],
};

function toResult(r: {
  roomConflict: boolean;
  teacherConflict: boolean;
  conflictIds: string[];
}): ConflictResult {
  const messages: string[] = [];
  if (r.roomConflict) messages.push("Trùng phòng với buổi khác cùng giờ");
  if (r.teacherConflict) messages.push("Trùng giáo viên với buổi khác cùng giờ");
  return { ...r, messages };
}

/** Câu cảnh báo VI gộp (null nếu không trùng). */
export function conflictMessage(c: {
  roomConflict: boolean;
  teacherConflict: boolean;
}): string | null {
  const parts: string[] = [];
  if (c.teacherConflict) parts.push("trùng lịch giáo viên");
  if (c.roomConflict) parts.push("trùng phòng");
  if (parts.length === 0) return null;
  return `Cảnh báo xếp lịch: ${parts.join(" và ")} với lớp khác.`;
}

/**
 * WHERE cho các buổi "đối chiếu": bỏ buổi đã huỷ, bỏ lớp đã xoá mềm, tuỳ chọn giới
 * hạn theo cơ sở, và LOẠI buổi của chính lớp đang xét (`excludeClassId`) — double-book
 * chỉ có nghĩa GIỮA 2 LỚP; buổi cùng lớp dùng chung phòng/GV là bình thường.
 */
function othersWhere(opts: {
  centerId?: string | null;
  excludeClassId?: string | null;
  excludeSessionId?: string | null;
}) {
  return {
    status: { not: "CANCELLED" as const },
    ...(opts.excludeSessionId ? { id: { not: opts.excludeSessionId } } : {}),
    ...(opts.excludeClassId ? { classId: { not: opts.excludeClassId } } : {}),
    class: {
      deletedAt: null,
      ...(opts.centerId ? { centerId: opts.centerId } : {}),
    },
  };
}

/** Dò trùng cho 1 buổi candidate so với các buổi khác CÙNG NGÀY. */
export async function detectSessionConflicts(input: {
  sessionId?: string;
  /** Loại buổi của chính lớp này khỏi phép so (double-book chỉ tính giữa 2 lớp). */
  excludeClassId?: string | null;
  /** null = soát TOÀN HỆ THỐNG (GV có thể dạy 2 cơ sở → trùng liên cơ sở vẫn bắt). */
  centerId: string | null;
  roomId: string | null;
  teacherId: string | null;
  startAt: Date;
  endAt: Date;
}): Promise<ConflictResult> {
  if (!input.roomId && !input.teacherId) return EMPTY;
  const d = input.startAt;
  const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dayEnd = new Date(dayStart.getTime() + 24 * 3_600_000);

  const others = await db.classSession.findMany({
    where: {
      ...othersWhere({
        centerId: input.centerId,
        excludeClassId: input.excludeClassId,
        excludeSessionId: input.sessionId,
      }),
      date: { gte: dayStart, lt: dayEnd },
    },
    select: SESSION_SELECT,
  });

  const res = detectScheduleConflict(rowsToSlots(others), {
    id: input.sessionId,
    roomId: input.roomId,
    teacherId: input.teacherId,
    startAt: input.startAt,
    endAt: input.endAt,
  });
  return toResult(res);
}

/**
 * Dò trùng cho 1 LOẠT ngày (sinh buổi / dời cả lớp hàng loạt). 1 query lấy buổi hiện
 * có trong khoảng ngày, rồi kiểm tra in-memory từng ngày candidate. Trả về danh sách
 * ngày trùng + thông điệp (caller quyết định WARN hay BLOCK).
 */
export async function detectBatchConflicts(input: {
  centerId: string | null;
  excludeClassId?: string | null;
  /** Buổi của chính lớp đang dời — loại khỏi phép so (đang được gán ngày mới). */
  excludeSessionIds?: string[];
  classStartTime: string | null;
  classEndTime: string | null;
  roomId: string | null;
  teacherId: string | null;
  dates: Date[];
}): Promise<{ date: Date; messages: string[] }[]> {
  if ((!input.roomId && !input.teacherId) || input.dates.length === 0) return [];
  const times = input.dates.map((d) => d.getTime());
  const minDay = new Date(Math.min(...times));
  const maxDay = new Date(Math.max(...times));
  const rangeStart = new Date(minDay.getFullYear(), minDay.getMonth(), minDay.getDate());
  const rangeEnd = new Date(
    maxDay.getFullYear(),
    maxDay.getMonth(),
    maxDay.getDate() + 1,
  );

  const skip = new Set(input.excludeSessionIds ?? []);
  const others = await db.classSession.findMany({
    where: {
      ...othersWhere({ centerId: input.centerId, excludeClassId: input.excludeClassId }),
      date: { gte: rangeStart, lt: rangeEnd },
    },
    select: SESSION_SELECT,
  });
  const slots = rowsToSlots(others.filter((o) => !skip.has(o.id)));

  const out: { date: Date; messages: string[] }[] = [];
  for (const d of input.dates) {
    const win = sessionWindow(d, input.classStartTime, input.classEndTime);
    const res = detectScheduleConflict(slots, {
      roomId: input.roomId,
      teacherId: input.teacherId,
      startAt: win.startAt,
      endAt: win.endAt,
    });
    if (res.roomConflict || res.teacherConflict) {
      out.push({ date: d, messages: toResult(res).messages });
    }
  }
  return out;
}

/**
 * T4.1 — dò trùng cho 1 buổi ĐÃ TỒN TẠI (dùng khi xếp học bù: buổi đích thuộc lớp
 * khác, có thể khác cơ sở). Buổi không tồn tại / thiếu dữ liệu → không kết luận trùng.
 */
export async function detectConflictsForExistingSession(
  sessionId: string,
): Promise<ConflictResult> {
  const s = await db.classSession.findUnique({
    where: { id: sessionId },
    select: { ...SESSION_SELECT, classId: true },
  });
  if (!s?.class?.startTime) return EMPTY;

  const [slot] = rowsToSlots([s]);
  if (!slot) return EMPTY;

  return detectSessionConflicts({
    sessionId: s.id,
    excludeClassId: s.classId,
    centerId: null,
    roomId: slot.roomId ?? null,
    teacherId: slot.teacherId ?? null,
    startAt: slot.startAt,
    endAt: slot.endAt,
  });
}
