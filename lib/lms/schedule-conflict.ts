import "server-only";
import { db } from "@/lib/db";
import { detectScheduleConflict, type Slot } from "@/lib/lms/scheduling";

// =============================================================================
// LMS-6 — nối detectScheduleConflict vào write-path: 1 buổi candidate có trùng
// PHÒNG / GIÁO VIÊN với buổi khác cùng ngày (cùng cơ sở) không.
//   • cửa sổ buổi = [date, date + (endTime-startTime của lớp)] (fallback 90').
//   • phòng/GV hiệu lực = actualRoomId/actualTeacherId ?? class.roomId/teacherId
//     (ClassSession không có cột phòng/GV riêng — dùng của lớp + override "actual").
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

/** PURE — quy đổi các buổi (kèm lớp) thành Slot. Ưu tiên substitute ?? actual ?? lớp. */
export function rowsToSlots(rows: SessionRow[]): Slot[] {
  return rows.map((o) => {
    const win = sessionWindow(o.date, o.class?.startTime, o.class?.endTime);
    return {
      id: o.id,
      roomId: o.substituteRoomId ?? o.actualRoomId ?? o.class?.roomId ?? null,
      teacherId: o.substituteTeacherId ?? o.actualTeacherId ?? o.class?.teacherId ?? null,
      startAt: win.startAt,
      endAt: win.endAt,
    };
  });
}

const SESSION_SELECT = {
  id: true,
  date: true,
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

/** Dò trùng cho 1 buổi candidate so với các buổi khác CÙNG NGÀY trong cùng cơ sở. */
export async function detectSessionConflicts(input: {
  sessionId?: string;
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
      status: { not: "CANCELLED" },
      date: { gte: dayStart, lt: dayEnd },
      ...(input.sessionId ? { id: { not: input.sessionId } } : {}),
      ...(input.centerId ? { class: { centerId: input.centerId } } : {}),
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
 * Dò trùng cho 1 LOẠT ngày (sinh buổi hàng loạt). 1 query lấy buổi hiện có cùng
 * cơ sở trong khoảng ngày, rồi kiểm tra in-memory từng ngày candidate (báo cáo,
 * KHÔNG chặn). Trả về danh sách ngày trùng + thông điệp.
 */
export async function detectBatchConflicts(input: {
  centerId: string | null;
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

  const others = await db.classSession.findMany({
    where: {
      status: { not: "CANCELLED" },
      date: { gte: rangeStart, lt: rangeEnd },
      ...(input.centerId ? { class: { centerId: input.centerId } } : {}),
    },
    select: SESSION_SELECT,
  });
  const slots = rowsToSlots(others);

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
