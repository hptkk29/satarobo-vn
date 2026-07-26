import "server-only";
import { db } from "@/lib/db";
import { computeSessionDates, expandHolidaySet } from "@/lib/classes/schedule";
import { detectBatchConflicts } from "@/lib/lms/schedule-conflict";
import { formatDateVN } from "@/lib/format/date";

// =============================================================================
// W2-4 (LMS-6) — soát trùng GV/phòng ở write-path sinh buổi.
// T4.2 — nay đi qua `lib/lms/schedule-conflict.ts` (xét substitute/actual của buổi
// LỚP KHÁC). Bản `findScheduleConflicts` cũ chỉ so GV/phòng CẤP LỚP nên bỏ sót lớp
// có dạy-thay / đổi phòng ⇒ đã gỡ bỏ, mọi call-site chuyển sang module mới.
// Default an toàn: thiếu dữ liệu (không GV & không phòng, hoặc lớp không có
// startTime) ⇒ KHÔNG kết luận trùng (tránh chặn nhầm lớp hợp lệ).
// =============================================================================

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
 * W2-4 / T4.2 — soát trùng GV/phòng cho lô buổi sắp sinh. KHÔNG chặn (chỉ cảnh báo)
 * để không khoá vận hành lớp. Bỏ qua khi lớp chưa có startTime (date 00:00 → không
 * đủ dữ liệu kết luận trùng). Liệt kê tối đa 3 ngày trùng cho dễ xử lý.
 */
async function warnIfConflict(
  cls: {
    id: string;
    centerId: string | null;
    teacherId: string | null;
    roomId: string | null;
    startTime: string | null;
    endTime: string | null;
  },
  data: { date: Date }[],
): Promise<string | undefined> {
  if (!cls.startTime || (!cls.teacherId && !cls.roomId)) return undefined;
  try {
    const conflicts = await detectBatchConflicts({
      // centerId = null → soát toàn hệ thống: GV có thể dạy 2 cơ sở.
      centerId: null,
      excludeClassId: cls.id,
      classStartTime: cls.startTime,
      classEndTime: cls.endTime,
      teacherId: cls.teacherId,
      roomId: cls.roomId,
      dates: data.map((d) => d.date),
    });
    return summarizeConflicts(conflicts);
  } catch {
    return undefined; // best-effort: lỗi soát trùng không chặn sinh buổi
  }
}

/** Gộp danh sách ngày trùng thành 1 câu cảnh báo VI (undefined nếu không trùng). */
export function summarizeConflicts(
  conflicts: { date: Date; messages: string[] }[],
): string | undefined {
  if (conflicts.length === 0) return undefined;
  const shown = conflicts.slice(0, 3).map((c) => formatDateVN(c.date));
  const more = conflicts.length > shown.length ? ` (+${conflicts.length - shown.length} buổi nữa)` : "";
  const kinds = [...new Set(conflicts.flatMap((c) => c.messages))].join("; ");
  return `Cảnh báo xếp lịch — ${kinds}. Ngày: ${shown.join(", ")}${more}.`;
}
