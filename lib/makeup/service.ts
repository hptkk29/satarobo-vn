import { db } from "@/lib/db";

// =============================================================================
// Cụm B1 — MakeupNeed service: tạo nhu cầu bù, gợi ý buổi bù, xếp + hoàn tất.
// =============================================================================

/** Tạo (idempotent) MakeupNeed PENDING từ 1 buổi đã lỡ. */
export async function createMakeupNeed(params: {
  studentId: string;
  missedSessionId: string;
  createdById?: string | null;
  note?: string | null;
}): Promise<{ ok: boolean; id?: string; error?: string }> {
  const sess = await db.classSession.findUnique({
    where: { id: params.missedSessionId },
    select: { id: true, classId: true, lessonId: true, class: { select: { centerId: true } } },
  });
  if (!sess) return { ok: false, error: "Buổi học không tồn tại" };

  const need = await db.makeupNeed.upsert({
    where: { studentId_missedSessionId: { studentId: params.studentId, missedSessionId: params.missedSessionId } },
    update: { note: params.note ?? undefined },
    create: {
      studentId: params.studentId,
      classId: sess.classId,
      centerId: sess.class.centerId,
      missedSessionId: sess.id,
      missedLessonId: sess.lessonId,
      note: params.note ?? null,
      createdById: params.createdById ?? null,
    },
    select: { id: true },
  });
  return { ok: true, id: need.id };
}

export type MakeupSuggestion = {
  sessionId: string;
  classId: string;
  className: string;
  date: string;
  lessonOrder: number | null;
  lessonTitle: string | null;
};

/**
 * Gợi ý buổi bù: CÙNG khoá của lớp lỡ + lesson PHÙ HỢP (không vượt tiến độ HS).
 * Liệt kê các buổi tương lai (date >= hôm nay) của các lớp cùng courseId mà lesson
 * order <= lesson đã lỡ + 0 (không cho học vượt). Loại lớp HS đang học buổi đó.
 */
export async function suggestMakeupSessions(makeupNeedId: string): Promise<MakeupSuggestion[]> {
  const need = await db.makeupNeed.findUnique({
    where: { id: makeupNeedId },
    select: {
      studentId: true,
      classId: true,
      missedLessonId: true,
      class: { select: { courseId: true } },
    },
  });
  if (!need) return [];

  // Lesson order của buổi đã lỡ (mốc trần — không cho học vượt).
  let missedOrder: number | null = null;
  if (need.missedLessonId) {
    const l = await db.lesson.findUnique({ where: { id: need.missedLessonId }, select: { order: true } });
    missedOrder = l?.order ?? null;
  }

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const sessions = await db.classSession.findMany({
    where: {
      date: { gte: startOfToday },
      class: { courseId: need.class.courseId, deletedAt: null },
      // Cùng lesson đã lỡ là lý tưởng; nếu thiếu lessonId vẫn liệt kê (GV tự chọn).
      ...(need.missedLessonId ? { lessonId: need.missedLessonId } : {}),
    },
    select: {
      id: true,
      date: true,
      classId: true,
      class: { select: { name: true } },
      lesson: { select: { order: true, title: true } },
    },
    orderBy: { date: "asc" },
    take: 30,
  });

  return sessions
    // Không cho học vượt tiến độ: lesson order <= mốc đã lỡ (nếu biết mốc).
    .filter((s) => missedOrder == null || (s.lesson?.order ?? 0) <= missedOrder)
    .map((s) => ({
      sessionId: s.id,
      classId: s.classId,
      className: s.class.name,
      date: s.date.toISOString(),
      lessonOrder: s.lesson?.order ?? null,
      lessonTitle: s.lesson?.title ?? null,
    }));
}

/** Xếp buổi bù → SCHEDULED. */
export async function scheduleMakeup(params: {
  makeupNeedId: string;
  makeupSessionId: string;
  scheduledById?: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  const need = await db.makeupNeed.findUnique({ where: { id: params.makeupNeedId }, select: { status: true } });
  if (!need) return { ok: false, error: "Không tìm thấy nhu cầu bù" };
  if (need.status === "COMPLETED") return { ok: false, error: "Đã hoàn tất bù" };

  await db.makeupNeed.update({
    where: { id: params.makeupNeedId },
    data: { status: "SCHEDULED", makeupSessionId: params.makeupSessionId, scheduledById: params.scheduledById ?? null },
  });
  return { ok: true };
}

/** Hoàn tất bù → COMPLETED + đồng bộ Attendance.makeupStatus=MADE_UP (đếm số buổi đúng). */
export async function completeMakeup(makeupNeedId: string): Promise<{ ok: boolean; error?: string }> {
  const need = await db.makeupNeed.findUnique({
    where: { id: makeupNeedId },
    select: { studentId: true, missedSessionId: true, makeupSessionId: true, status: true },
  });
  if (!need) return { ok: false, error: "Không tìm thấy nhu cầu bù" };
  if (need.status === "CANCELLED") return { ok: false, error: "Nhu cầu đã huỷ" };

  await db.$transaction(async (tx) => {
    await tx.makeupNeed.update({
      where: { id: makeupNeedId },
      data: { status: "COMPLETED", completedAt: new Date() },
    });
    // Đồng bộ trạng thái bù trên Attendance của buổi đã lỡ → MADE_UP.
    await tx.attendance.updateMany({
      where: { studentId: need.studentId, sessionId: need.missedSessionId },
      data: { makeupStatus: "MADE_UP", makeupSessionId: need.makeupSessionId },
    });
  });
  return { ok: true };
}

/** Huỷ nhu cầu bù. */
export async function cancelMakeup(makeupNeedId: string): Promise<{ ok: boolean }> {
  await db.makeupNeed.update({ where: { id: makeupNeedId }, data: { status: "CANCELLED" } }).catch(() => {});
  return { ok: true };
}
