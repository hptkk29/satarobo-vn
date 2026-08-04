import "server-only";
import { db } from "@/lib/db";
import {
  EVAL_CRITERIA,
  EVAL_NOTE_FIELDS,
  normalizeEvalNotes,
  type EvalNotes,
} from "@/lib/lms/session-eval-rubric";

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
  /** Tên dự án buổi (phiếu nhận xét mở rộng site GV) — null với nhận xét cũ. */
  projectName: string | null;
  /** 4 mục văn xuôi Kiến thức/Kỹ năng/Thái độ/Đề xuất — null nếu phiếu không có mục nào. */
  notes: EvalNotes | null;
  /** Rubric năng lực { criterionId: mức 1-5 } (lib/lms/session-eval-rubric) — chỉ giữ
   *  tiêu chí hợp lệ; null nếu phiếu không chấm rubric. */
  rubric: Record<string, number> | null;
};

// ─── PURE — parse Json phiếu mở rộng (test được, không DB) ───────────────────
// Dữ liệu notes/rubric là Json nullable do GV ghi — có thể null/sai dạng, KHÔNG throw.

/** 4 mục nhận xét văn xuôi từ Json đã lưu → null nếu không có mục nào có nội dung. */
export function parseFeedbackNotes(raw: unknown): EvalNotes | null {
  const notes = normalizeEvalNotes(raw);
  const hasAny = EVAL_NOTE_FIELDS.some((f) => notes[f.key].trim().length > 0);
  return hasAny ? notes : null;
}

/**
 * Rubric từ Json đã lưu → chỉ giữ tiêu chí ĐÃ BIẾT (EVAL_CRITERIA) có mức 1-5 hợp lệ;
 * null nếu không còn gì (khác normalizeEvalRatings: KHÔNG chế mức mặc định — phiếu
 * không chấm rubric thì portal không được bịa điểm 3 cho phụ huynh xem).
 */
export function parseFeedbackRubric(raw: unknown): Record<string, number> | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  const out: Record<string, number> = {};
  for (const c of EVAL_CRITERIA) {
    const v0 = obj[c.id];
    const v = typeof v0 === "number" ? v0 : typeof v0 === "string" ? Number(v0) : NaN;
    if (Number.isInteger(v) && v >= 1 && v <= 5) out[c.id] = v;
  }
  return Object.keys(out).length > 0 ? out : null;
}

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
      projectName: true,
      notes: true,
      rubric: true,
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
      projectName: r.projectName,
      notes: parseFeedbackNotes(r.notes),
      rubric: parseFeedbackRubric(r.rubric),
    };
  });
}
