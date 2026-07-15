import "server-only";
import { db } from "@/lib/db";

// Portal v2 — nhận xét buổi học (StudentSessionFeedback) của con đang chọn.

export type FeedbackItem = {
  id: string;
  order: number | null;
  title: string;
  dateISO: string;
  teacher: string | null;
  className: string | null;
  comment: string;
  rating: number | null;
};

/**
 * @param limit LIMIT đẩy xuống DB (mặc định 20 — đủ cho trang Nhận xét, học viên
 * >50 feedback không phình payload). Feed thông báo chỉ cần 3 card/con →
 * truyền 3, KHÔNG kéo toàn bộ nhận xét về rồi slice.
 */
export async function getStudentFeedback(studentId: string, limit = 20): Promise<FeedbackItem[]> {
  const rows = await db.studentSessionFeedback.findMany({
    where: { studentId },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      comment: true,
      rating: true,
      createdById: true,
      classSession: {
        select: {
          date: true,
          lesson: { select: { order: true, title: true } },
          class: { select: { classCode: true } },
        },
      },
    },
  });

  const teacherIds = [...new Set(rows.map((r) => r.createdById))];
  const teachers = teacherIds.length
    ? await db.user.findMany({ where: { id: { in: teacherIds } }, select: { id: true, name: true } })
    : [];
  const tmap = new Map(teachers.map((t) => [t.id, t.name]));

  return rows.map((r) => {
    const les = r.classSession?.lesson;
    return {
      id: r.id,
      order: les?.order ?? null,
      title: les ? `Buổi ${les.order}: ${les.title}` : "Buổi học",
      dateISO: r.classSession?.date?.toISOString() ?? "",
      teacher: tmap.get(r.createdById) ?? null,
      className: r.classSession?.class?.classCode ?? null,
      // comment nay nullable (phiếu nhận xét buổi rubric-only) → coalesce cho portal PH.
      comment: r.comment ?? "",
      rating: r.rating,
    };
  });
}
