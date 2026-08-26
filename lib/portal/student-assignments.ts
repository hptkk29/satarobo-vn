import "server-only";
import { db } from "@/lib/db";
import { assignmentWindow, realDueAt } from "@/lib/lms/assignment-window";
import { getStudentSchedule } from "@/lib/portal/schedule";

// Portal v2 — Cổng học sinh "Bài tập": lộ trình từng buổi + trạng thái bài tập của con.

const ACTIVE = ["CONFIRMED", "STUDYING", "ACTIVE", "PAUSED"] as const;
const DONE = new Set(["SUBMITTED", "GRADED"]);

export type TrackAssignment = {
  id: string;
  title: string;
  /** Hạn nộp THẬT (đã lọc sentinel 1970) — null = bài không đặt hạn, PH thấy ô trống. */
  dueAt: string | null;
  done: boolean;
  /**
   * "Hết đường nộp" — cổng nộp bài sẽ chặn nếu PH bấm vào (site GV 25/08). Đang trong
   * cửa nộp bù GV mở thì KHÔNG phải `closed`: bài vẫn nộp được, gắn cờ chỉ làm PH tưởng
   * đã mất bài.
   */
  closed: boolean;
  /**
   * `closed` VÌ QUÁ HẠN — tức có hạn nộp thật và hạn đó đã trôi qua.
   *
   * Tách khỏi `closed` vì truy vấn lấy cả `status = CLOSED`: bài admin đóng tay mà chưa
   * từng đặt hạn cũng đóng, nhưng dán "Quá hạn" cho nó là báo PH lỡ một cái hạn KHÔNG
   * HỀ TỒN TẠI — mà ô "Hạn" ngay cạnh thì đang để trống.
   */
  overdue: boolean;
};
export type TrackItem = {
  key: string;
  order: number;
  title: string;
  sessionDate: string | null;
  taught: boolean;
  assignment: TrackAssignment | null;
};
export type AssignmentTrack = {
  courseName: string | null;
  className: string | null;
  teacher: string | null;
  done: number;
  total: number;
  progressPct: number;
  items: TrackItem[];
};

export async function getStudentAssignmentTrack(studentId: string): Promise<AssignmentTrack> {
  const [enrollments, sched, enrTeacher] = await Promise.all([
    db.enrollment.findMany({
      where: { studentId, status: { in: [...ACTIVE] }, deletedAt: null },
      select: { classId: true },
    }),
    getStudentSchedule(studentId),
    db.enrollment.findFirst({
      where: { studentId },
      orderBy: { enrolledAt: "desc" },
      select: { class: { select: { teacher: { select: { name: true } } } } },
    }),
  ]);
  const classIds = enrollments.map((e) => e.classId);

  const now = new Date();
  const nowMs = now.getTime();
  const items: TrackItem[] = [];
  if (classIds.length > 0) {
    const [sessions, assignments] = await Promise.all([
      db.classSession.findMany({
        where: { classId: { in: classIds }, lessonId: { not: null } },
        select: { id: true, date: true, lesson: { select: { id: true, order: true, title: true } } },
        orderBy: { date: "asc" },
      }),
      db.assignment.findMany({
        where: { classId: { in: classIds }, lessonId: { not: null }, status: { in: ["PUBLISHED", "CLOSED"] } },
        select: {
          id: true,
          lessonId: true,
          title: true,
          dueAt: true,
          // Cần cho assignmentWindow — thiếu 2 cột này thì cổng PH và màn GV nói khác nhau.
          status: true,
          lateUntil: true,
          submissions: { where: { studentId }, select: { status: true }, take: 1 },
        },
      }),
    ]);

    const byLesson = new Map<string, (typeof assignments)[number]>();
    for (const a of assignments) if (a.lessonId && !byLesson.has(a.lessonId)) byLesson.set(a.lessonId, a);

    // 1 buổi / lesson (buổi sớm nhất của lesson đó).
    const seen = new Set<string>();
    for (const s of sessions) {
      const l = s.lesson;
      if (!l || seen.has(l.id)) continue;
      seen.add(l.id);
      const a = byLesson.get(l.id);
      let assignment: TrackAssignment | null = null;
      if (a) {
        const done = DONE.has(a.submissions[0]?.status ?? "");
        // Cùng hàm mà cổng nộp bài (portal/bai-tap/actions) và màn GV dùng: cờ của PH
        // phải tắt đúng lúc bài lại nộp được, không thì PH thấy đỏ mà vẫn nộp được (hoặc
        // ngược lại — thấy bình thường mà nộp bị chặn).
        const closed = !done && !assignmentWindow(a, now).acceptsSubmission;
        // Hạn thật, không phải `a.dueAt` thô: bài seed để epoch 1970 mà in ra thì PH đọc
        // "Hạn 01/01/1970" và cờ dưới đây cũng sẽ nói bài quá hạn 56 năm.
        const due = realDueAt(a.dueAt);
        const overdue = closed && due != null && now.getTime() > due.getTime();
        assignment = { id: a.id, title: a.title, dueAt: due?.toISOString() ?? null, done, closed, overdue };
      }
      items.push({
        key: l.id,
        order: l.order,
        title: l.title,
        sessionDate: s.date.toISOString(),
        taught: s.date.getTime() < nowMs,
        assignment,
      });
    }
    items.sort((x, y) => x.order - y.order);
  }

  return {
    courseName: sched?.courseName ?? null,
    className: sched?.className ?? null,
    teacher: enrTeacher?.class?.teacher?.name ?? null,
    done: sched?.done ?? 0,
    total: sched?.total ?? items.length,
    progressPct: sched?.total ? Math.round(((sched?.done ?? 0) / sched.total) * 100) : 0,
    items,
  };
}
