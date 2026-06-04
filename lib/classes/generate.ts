import "server-only";
import { db } from "@/lib/db";
import { computeSessionDates, expandHolidaySet } from "@/lib/classes/schedule";

// =============================================================================
// P2 — TỰ SINH buổi học cho 1 lớp theo lịch (scheduleDays) + số buổi chuẩn của
// khoá (Course.totalSessions, fallback đếm Lesson giáo trình), BỎ QUA ngày nghỉ.
// Gắn lessonId theo thứ tự giáo trình nếu có. Mặc định chỉ sinh khi lớp CHƯA có buổi.
// =============================================================================

export async function generateClassSessions(
  classId: string,
  opts: { onlyIfEmpty?: boolean } = {},
): Promise<{ ok: boolean; generated: number; error?: string }> {
  const onlyIfEmpty = opts.onlyIfEmpty ?? true;

  const cls = await db.class.findFirst({
    where: { id: classId, deletedAt: null },
    select: {
      id: true,
      centerId: true,
      scheduleDays: true,
      startDate: true,
      startTime: true,
      course: { select: { id: true, totalSessions: true } },
    },
  });
  if (!cls) return { ok: false, generated: 0, error: "Lớp không tồn tại" };
  if (!cls.scheduleDays || cls.scheduleDays.length === 0) {
    return { ok: false, generated: 0, error: "Lớp chưa có lịch học (scheduleDays)" };
  }

  const existing = await db.classSession.count({ where: { classId } });
  if (onlyIfEmpty && existing > 0) return { ok: true, generated: 0 };

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
  }));

  await db.classSession.createMany({ data });
  return { ok: true, generated: data.length };
}
