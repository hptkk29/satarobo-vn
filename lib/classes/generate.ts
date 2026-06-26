import "server-only";
import { db } from "@/lib/db";
import { computeSessionDates, expandHolidaySet } from "@/lib/classes/schedule";
import {
  detectScheduleConflict,
  sessionEndAt,
  type Slot,
} from "@/lib/lms/scheduling";

// =============================================================================
// W2-4 (LMS-6) — nối detectScheduleConflict (THUẦN) vào write-path bằng query DB.
// GV xét ở cấp lớp (Class.teacherId). Phòng xét theo TỪNG BUỔI: ưu tiên
// ClassSession.roomId thực của buổi, fallback Class.roomId nếu buổi chưa set
// (W2-4b — cột ClassSession.roomId đã có). Buổi của LỚP KHÁC cùng GV hoặc cùng
// phòng có khung giờ giao nhau ⇒ trùng lịch.
// Default an toàn: thiếu dữ liệu (không GV & không phòng, hoặc lớp không có
// startTime) ⇒ KHÔNG kết luận trùng (tránh chặn nhầm lớp hợp lệ).
// =============================================================================

export type ScheduleConflictResult = {
  teacherConflict: boolean;
  roomConflict: boolean;
  conflictIds: string[];
};

/**
 * DB-aware: với 1 lớp (teacherId/roomId) + danh sách buổi ứng viên (đã có
 * startAt/endAt), tìm trùng GV/phòng so với buổi của LỚP KHÁC. Tái dùng
 * detectScheduleConflict (THUẦN). KHÔNG xét buổi cùng lớp (loại theo classId)
 * và KHÔNG xét buổi đã CANCELLED.
 */
export async function findScheduleConflicts(opts: {
  classId: string;
  teacherId: string | null;
  roomId: string | null;
  candidates: { id?: string; startAt: Date; endAt: Date }[];
}): Promise<ScheduleConflictResult> {
  const { classId, teacherId, roomId, candidates } = opts;
  const empty: ScheduleConflictResult = {
    teacherConflict: false,
    roomConflict: false,
    conflictIds: [],
  };
  // Không có GV lẫn phòng → không thể kết luận trùng → KHÔNG chặn.
  if ((!teacherId && !roomId) || candidates.length === 0) return empty;

  // Thu hẹp query theo khoảng ngày bao các buổi ứng viên (giờ địa phương).
  const times = candidates.map((c) => c.startAt.getTime());
  const lo = new Date(Math.min(...times));
  const hi = new Date(Math.max(...times));
  const dayStart = new Date(lo.getFullYear(), lo.getMonth(), lo.getDate());
  const dayEnd = new Date(hi.getFullYear(), hi.getMonth(), hi.getDate() + 1);

  const rows = await db.classSession.findMany({
    where: {
      classId: { not: classId }, // chỉ xét LỚP KHÁC (double-book giữa 2 lớp)
      status: { not: "CANCELLED" },
      date: { gte: dayStart, lt: dayEnd },
      class: { deletedAt: null },
      // teacherId/roomId là id duy nhất ⇒ khớp đã đảm bảo cùng GV/cùng phòng.
      // Phòng khớp ở cấp BUỔI (ClassSession.roomId) HOẶC cấp lớp (Class.roomId,
      // cho buổi chưa set roomId riêng). Over-fetch vô hại: lọc lại bằng Slot bên dưới.
      OR: [
        ...(teacherId ? [{ class: { teacherId } }] : []),
        ...(roomId ? [{ roomId }, { class: { roomId } }] : []),
      ],
    },
    select: {
      id: true,
      date: true,
      roomId: true, // W2-4b — phòng thực của buổi (ưu tiên hơn phòng cấp lớp)
      class: {
        select: {
          teacherId: true,
          roomId: true,
          startTime: true,
          endTime: true,
        },
      },
    },
  });

  // Bỏ qua buổi của lớp không có startTime (date = 00:00 placeholder) — tránh
  // dương tính giả do trùng "nửa đêm".
  const existing: Slot[] = rows
    .filter((r) => r.class?.startTime)
    .map((r) => ({
      id: r.id,
      teacherId: r.class?.teacherId ?? null,
      // ưu tiên phòng của BUỔI, fallback phòng cấp lớp khi buổi chưa set.
      roomId: r.roomId ?? r.class?.roomId ?? null,
      startAt: r.date,
      endAt: sessionEndAt(r.date, r.class?.startTime, r.class?.endTime),
    }));
  if (existing.length === 0) return empty;

  let teacherConflict = false;
  let roomConflict = false;
  const ids = new Set<string>();
  for (const c of candidates) {
    const res = detectScheduleConflict(existing, {
      id: c.id,
      teacherId,
      roomId,
      startAt: c.startAt,
      endAt: c.endAt,
    });
    if (res.teacherConflict) teacherConflict = true;
    if (res.roomConflict) roomConflict = true;
    for (const id of res.conflictIds) ids.add(id);
  }
  return { teacherConflict, roomConflict, conflictIds: [...ids] };
}

/** Câu cảnh báo VI từ kết quả conflict (null nếu không trùng). */
export function scheduleConflictWarning(c: ScheduleConflictResult): string | null {
  const parts: string[] = [];
  if (c.teacherConflict) parts.push("trùng lịch giáo viên");
  if (c.roomConflict) parts.push("trùng phòng");
  if (parts.length === 0) return null;
  return `Cảnh báo xếp lịch: ${parts.join(" và ")} với lớp khác ở một số buổi.`;
}

// =============================================================================
// P2 — TỰ SINH buổi học cho 1 lớp theo lịch (scheduleDays) + số buổi chuẩn của
// khoá (Course.totalSessions, fallback đếm Lesson giáo trình), BỎ QUA ngày nghỉ.
// Gắn lessonId theo thứ tự giáo trình nếu có. Mặc định chỉ sinh khi lớp CHƯA có buổi.
// =============================================================================

export async function generateClassSessions(
  classId: string,
  opts: { onlyIfEmpty?: boolean } = {},
): Promise<{ ok: boolean; generated: number; error?: string; warning?: string }> {
  const onlyIfEmpty = opts.onlyIfEmpty ?? true;

  const cls = await db.class.findFirst({
    where: { id: classId, deletedAt: null },
    select: {
      id: true,
      centerId: true,
      teacherId: true,
      roomId: true,
      scheduleDays: true,
      startDate: true,
      startTime: true,
      endTime: true,
      curriculumId: true,
      course: { select: { id: true, totalSessions: true } },
      // R7-06 — kế hoạch buổi của RIÊNG lớp (nếu đã pin curriculum/snapshot).
      sessionPlans: {
        orderBy: { order: "asc" },
        select: { id: true, lessonId: true },
      },
    },
  });
  if (!cls) return { ok: false, generated: 0, error: "Lớp không tồn tại" };
  if (!cls.scheduleDays || cls.scheduleDays.length === 0) {
    return { ok: false, generated: 0, error: "Lớp chưa có lịch học (scheduleDays)" };
  }

  const existing = await db.classSession.count({ where: { classId } });
  if (onlyIfEmpty && existing > 0) return { ok: true, generated: 0 };

  // ── R7-06: PLAN-AWARE (additive) ──────────────────────────────────────────
  // Lớp đã có ClassSessionPlan (giáo trình ghim / snapshot) → sinh buổi TỪ plan,
  // gắn planId + lessonId theo thứ tự plan. Số buổi = số plan.
  const plans = cls.sessionPlans ?? [];
  if (plans.length > 0) {
    const holidayRows = await db.holiday.findMany({
      where: { OR: [{ centerId: cls.centerId }, { centerId: null }] },
      select: { date: true, endDate: true },
    });
    const holidays = expandHolidaySet(holidayRows);

    const from = cls.startDate ?? new Date();
    const dates = computeSessionDates({
      from,
      scheduleDays: cls.scheduleDays,
      count: plans.length,
      holidays,
    });
    if (dates.length === 0) {
      return { ok: false, generated: 0, error: "Không tính được ngày buổi học" };
    }

    const [ph, pm] = (cls.startTime ?? "00:00").split(":").map((x) => parseInt(x, 10));
    const data = dates.map((d, i) => ({
      classId,
      date: new Date(d.getFullYear(), d.getMonth(), d.getDate(), ph || 0, pm || 0),
      planId: plans[i]?.id ?? null,
      lessonId: plans[i]?.lessonId ?? null,
      // W2-4b — phòng buổi mặc định = phòng của lớp (cho soát trùng phòng per-buổi).
      roomId: cls.roomId ?? null,
      centerId: cls.centerId, // FL3-02 — denormalize từ class cho scopedDb
    }));

    // W2-4 — cảnh báo trùng GV/phòng (KHÔNG chặn sinh buổi; default an toàn).
    const warning = await warnIfConflict(cls, data);
    await db.classSession.createMany({ data });
    return { ok: true, generated: data.length, ...(warning ? { warning } : {}) };
  }

  // ── FALLBACK (lớp cũ, chưa pin): GIỮ NGUYÊN hành vi cũ ─────────────────────
  // Số buổi chuẩn: Course.totalSessions → fallback đếm Lesson giáo trình active.
  let count = cls.course?.totalSessions ?? 0;
  // Lessons giáo trình (để gắn lessonId theo thứ tự).
  const curriculum = cls.course?.id
    ? await db.curriculum.findFirst({
        where: { courseId: cls.course.id, isActive: true },
        orderBy: { version: "desc" },
        select: { lessons: { orderBy: { order: "asc" }, select: { id: true } } },
      })
    : null;
  const lessonIds = curriculum?.lessons.map((l) => l.id) ?? [];
  if (count <= 0) count = lessonIds.length;
  if (count <= 0) {
    return { ok: false, generated: 0, error: "Khoá chưa cấu hình số buổi / giáo trình" };
  }

  const holidayRows = await db.holiday.findMany({
    where: { OR: [{ centerId: cls.centerId }, { centerId: null }] },
    select: { date: true, endDate: true },
  });
  const holidays = expandHolidaySet(holidayRows);

  const from = cls.startDate ?? new Date();
  const dates = computeSessionDates({ from, scheduleDays: cls.scheduleDays, count, holidays });
  if (dates.length === 0) return { ok: false, generated: 0, error: "Không tính được ngày buổi học" };

  const [hh, mm] = (cls.startTime ?? "00:00").split(":").map((x) => parseInt(x, 10));
  const data = dates.map((d, i) => ({
    classId,
    date: new Date(d.getFullYear(), d.getMonth(), d.getDate(), hh || 0, mm || 0),
    lessonId: lessonIds[i] ?? null,
    // W2-4b — phòng buổi mặc định = phòng của lớp (cho soát trùng phòng per-buổi).
    roomId: cls.roomId ?? null,
    centerId: cls.centerId, // FL3-02 — denormalize từ class cho scopedDb
  }));

  // W2-4 — cảnh báo trùng GV/phòng (KHÔNG chặn sinh buổi; default an toàn).
  const warning = await warnIfConflict(cls, data);
  await db.classSession.createMany({ data });
  return { ok: true, generated: data.length, ...(warning ? { warning } : {}) };
}

/**
 * W2-4 — soát trùng GV/phòng cho lô buổi sắp sinh. KHÔNG chặn (chỉ cảnh báo) để
 * không khoá vận hành lớp. Bỏ qua khi lớp chưa có startTime (date 00:00 → không
 * đủ dữ liệu kết luận trùng).
 */
async function warnIfConflict(
  cls: { id: string; teacherId: string | null; roomId: string | null; startTime: string | null; endTime: string | null },
  data: { date: Date }[],
): Promise<string | undefined> {
  if (!cls.startTime || (!cls.teacherId && !cls.roomId)) return undefined;
  try {
    const conflict = await findScheduleConflicts({
      classId: cls.id,
      teacherId: cls.teacherId,
      roomId: cls.roomId,
      candidates: data.map((d) => ({
        startAt: d.date,
        endAt: sessionEndAt(d.date, cls.startTime, cls.endTime),
      })),
    });
    return scheduleConflictWarning(conflict) ?? undefined;
  } catch {
    return undefined; // best-effort: lỗi soát trùng không chặn sinh buổi
  }
}
