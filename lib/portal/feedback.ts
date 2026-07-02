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

export async function getStudentFeedback(studentId: string): Promise<FeedbackItem[]> {
  const rows = await db.studentSessionFeedback.findMany({
    where: { studentId },
    orderBy: { createdAt: "desc" },
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
      comment: r.comment,
      rating: r.rating,
    };
  });
}
