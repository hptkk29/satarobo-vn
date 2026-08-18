import "server-only";
import { db } from "@/lib/db";
import { ENROLLMENT_ACTIVE_STATUS_LIST } from "@/lib/enrollment-status";
import { summarizeSessionFeedback } from "@/lib/lms/session-feedback-roster";
import {
  parseFeedbackNotes,
  parseFeedbackRubric,
  type EvalNotes,
} from "@/lib/lms/session-eval-rubric";

// Data cho tab "Đánh giá & Nhận xét" của trang chi tiết lớp: toàn bộ phiếu nhận xét
// buổi (StudentSessionFeedback) của MỘT lớp, xếp theo học viên × buổi.
//
// Cách ly cơ sở: lọc theo classId — caller PHẢI đã xác minh lớp thuộc tầm nhìn actor
// bằng scopedDb (app/(admin)/admin/classes/[id]/page.tsx dùng sdb.class.findFirst rồi
// notFound()). Cùng giao kèo đã ghi ở lib/classes/detail-tabs-data.ts. Không thể dựa
// vào scopedDb ở đây: StudentSessionFeedback KHÔNG có cột centerId nên không nằm trong
// SCOPED_MODELS — sdb.studentSessionFeedback.* chỉ là pass-through. ĐỪNG "vá" bằng cách
// thêm model vào SCOPED_MODELS: không có cột để lọc.

export type ClassFeedbackSession = {
  id: string;
  dateISO: string;
  /** "Bài 3: Tên bài" nếu buổi đã gắn giáo án, else topic, else "Buổi học". */
  label: string;
  status: string;
  /** Số HV đi học (PRESENT/LATE) — 0 nếu buổi chưa điểm danh. */
  attended: number;
  /** Số HV đi học ĐÃ có phiếu. */
  reviewed: number;
  attendanceTaken: boolean;
  complete: boolean;
};

export type ClassFeedbackEntry = {
  sessionId: string;
  studentId: string;
  projectName: string | null;
  notes: EvalNotes | null;
  rubric: Record<string, number> | null;
  comment: string;
  rating: number | null;
  /** Người VIẾT phiếu (createdById) — có thể là GV dạy thay, không phải GV chính lớp. */
  teacherName: string | null;
  updatedAtISO: string;
};

export type ClassFeedbackStudent = {
  id: string;
  name: string;
  studentCode: string | null;
  /** HV có phiếu ở lớp này nhưng KHÔNG còn ghi danh active (học bù / đã chuyển lớp). */
  isGuest: boolean;
  reviewedCount: number;
};

export type ClassSessionFeedbackData = {
  sessions: ClassFeedbackSession[];
  students: ClassFeedbackStudent[];
  entries: ClassFeedbackEntry[];
  /** Tổng số buổi của lớp (để báo khi danh sách bị cắt bởi limitSessions). */
  totalSessions: number;
};

/**
 * Toàn bộ phiếu nhận xét buổi của 1 lớp.
 *
 * @param limitSessions cửa sổ buổi GẦN NHẤT được nạp (mặc định 30). Panel nằm trong
 * <TabsContent> nên HTML vẫn được render server-side kể cả khi tab chưa mở — không
 * chặn thì lớp dài + 4 mục văn xuôi × 3000 ký tự làm phình payload MỌI lần mở trang lớp.
 */
export async function loadClassSessionFeedback(
  classId: string,
  limitSessions = 30,
): Promise<ClassSessionFeedbackData> {
  const [sessionRows, totalSessions] = await Promise.all([
    db.classSession.findMany({
      where: { classId },
      orderBy: { date: "desc" },
      take: limitSessions,
      select: {
        id: true,
        date: true,
        topic: true,
        status: true,
        lesson: { select: { order: true, title: true } },
      },
    }),
    db.classSession.count({ where: { classId } }),
  ]);

  const sessionIds = sessionRows.map((s) => s.id);
  if (sessionIds.length === 0) {
    return { sessions: [], students: [], entries: [], totalSessions };
  }

  const [enrollments, feedbacks, attendances] = await Promise.all([
    db.enrollment.findMany({
      where: {
        classId,
        status: { in: ENROLLMENT_ACTIVE_STATUS_LIST },
        deletedAt: null,
        student: { deletedAt: null },
      },
      orderBy: { student: { name: "asc" } },
      select: { student: { select: { id: true, name: true, studentCode: true } } },
    }),
    db.studentSessionFeedback.findMany({
      where: { classSessionId: { in: sessionIds } },
      select: {
        classSessionId: true,
        studentId: true,
        projectName: true,
        notes: true,
        rubric: true,
        comment: true,
        rating: true,
        createdById: true,
        updatedAt: true,
      },
    }),
    db.attendance.findMany({
      where: { sessionId: { in: sessionIds } },
      select: { sessionId: true, studentId: true, status: true },
    }),
  ]);

  // Tên người viết phiếu: MỘT truy vấn gộp, không hỏi theo từng phiếu. Dùng createdById
  // chứ không phải GV chính của lớp — buổi dạy thay thì hai thứ đó khác nhau.
  const authorIds = [...new Set(feedbacks.map((f) => f.createdById))];
  const authors = authorIds.length
    ? await db.user.findMany({ where: { id: { in: authorIds } }, select: { id: true, name: true } })
    : [];
  const authorName = new Map(authors.map((u) => [u.id, u.name]));

  // HV có phiếu nhưng không nằm trong roster active (học bù từ lớp khác, HV đã chuyển
  // lớp/nghỉ). Bỏ qua họ là làm phiếu biến mất im lặng khỏi màn quản lý.
  const rosterIds = new Set(enrollments.map((e) => e.student.id));
  const guestIds = [...new Set(feedbacks.map((f) => f.studentId))].filter(
    (id) => !rosterIds.has(id),
  );
  const guests = guestIds.length
    ? await db.student.findMany({
        where: { id: { in: guestIds } },
        // CHỈ tên + mã: màn này không có việc gì với liên lạc phụ huynh (#06 câu 46).
        select: { id: true, name: true, studentCode: true },
        orderBy: { name: "asc" },
      })
    : [];

  const attendanceBySession = new Map<string, { studentId: string; status: string }[]>();
  for (const a of attendances) {
    const arr = attendanceBySession.get(a.sessionId) ?? [];
    arr.push({ studentId: a.studentId, status: a.status });
    attendanceBySession.set(a.sessionId, arr);
  }
  const feedbackIdsBySession = new Map<string, string[]>();
  for (const f of feedbacks) {
    const arr = feedbackIdsBySession.get(f.classSessionId) ?? [];
    arr.push(f.studentId);
    feedbackIdsBySession.set(f.classSessionId, arr);
  }

  const sessions: ClassFeedbackSession[] = sessionRows.map((s) => {
    const sum = summarizeSessionFeedback(
      attendanceBySession.get(s.id) ?? [],
      feedbackIdsBySession.get(s.id) ?? [],
    );
    return {
      id: s.id,
      dateISO: s.date.toISOString(),
      label: s.lesson
        ? `Bài ${s.lesson.order}: ${s.lesson.title}`
        : (s.topic ?? "Buổi học"),
      status: s.status,
      attended: sum.attended,
      reviewed: sum.reviewed,
      attendanceTaken: sum.attendanceTaken,
      complete: sum.complete,
    };
  });

  const entries: ClassFeedbackEntry[] = feedbacks.map((f) => ({
    sessionId: f.classSessionId,
    studentId: f.studentId,
    projectName: f.projectName,
    notes: parseFeedbackNotes(f.notes),
    rubric: parseFeedbackRubric(f.rubric),
    // comment nullable từ khi có phiếu rubric-only → coalesce cho phía render.
    comment: f.comment ?? "",
    rating: f.rating,
    teacherName: authorName.get(f.createdById) ?? null,
    updatedAtISO: f.updatedAt.toISOString(),
  }));

  const countByStudent = new Map<string, number>();
  for (const f of feedbacks) {
    countByStudent.set(f.studentId, (countByStudent.get(f.studentId) ?? 0) + 1);
  }

  const students: ClassFeedbackStudent[] = [
    ...enrollments.map((e) => ({
      id: e.student.id,
      name: e.student.name,
      studentCode: e.student.studentCode,
      isGuest: false,
      reviewedCount: countByStudent.get(e.student.id) ?? 0,
    })),
    ...guests.map((g) => ({
      id: g.id,
      name: g.name,
      studentCode: g.studentCode,
      isGuest: true,
      reviewedCount: countByStudent.get(g.id) ?? 0,
    })),
  ];

  return { sessions, students, entries, totalSessions };
}
