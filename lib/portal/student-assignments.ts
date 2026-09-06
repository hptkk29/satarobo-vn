import "server-only";
import { db } from "@/lib/db";
import { GHI_DANH_DANG_HOC } from "@/lib/portal/trang-thai-ghi-danh";
import { assignmentWindow, realDueAt } from "@/lib/lms/assignment-window";
import { napBuoiCuaLop } from "@/lib/portal/buoi-hoc";
import { getStudentSchedule } from "@/lib/portal/schedule";
import { vnParts } from "@/lib/time/vn";

// Portal v2 — Cổng học sinh "Bài tập": lộ trình từng buổi + trạng thái bài tập của con.
//
// 06/09 — lộ trình đi theo BUỔI HỌC, không theo bài giáo trình. Bản cũ lọc
// `lessonId: { not: null }` rồi khử trùng theo `lesson.id` và xếp theo `Lesson.order`:
// lớp chưa ghim giáo trình ra lộ trình RỖNG, còn lớp có buổi bù thì mất đúng buổi bù
// (buổi bù mang cùng lessonId với buổi đã huỷ — xem lib/portal/buoi-hoc.ts).

const ACTIVE = GHI_DANH_DANG_HOC; // lib/portal/trang-thai-ghi-danh.ts
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
  /** `12/09/2026` theo lịch VN, tính sẵn ở server; `""` khi bài không đặt hạn. */
  nhanHan: string;
};
export type TrackItem = {
  key: string;
  /** Buổi thứ mấy của lớp — khớp site giáo viên/admin. */
  order: number;
  /** Tên bài TRẦN. */
  title: string;
  /** Nhãn đầy đủ `Buổi 5 - HP2 - Họa Sĩ Robot`. */
  nhan: string;
  /** `dd/MM/yyyy` theo lịch VN, tính sẵn ở server. */
  nhanNgay: string;
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
  const items: TrackItem[] = [];
  if (classIds.length > 0) {
    const [buoiList, assignments] = await Promise.all([
      // TOÀN BỘ buổi (kể cả buổi chưa gắn giáo án và buổi đã huỷ) — điều kiện để
      // `buildSessionNumberMap` đánh đúng số buổi. Buổi huỷ lọc bỏ lúc dựng danh sách.
      napBuoiCuaLop(classIds, now),
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

    // Bài giáo trình của TỪNG buổi — nạp riêng để truy vấn buổi không phải lọc
    // `lessonId != null` (chính cái lọc làm lộ trình rỗng ở lớp chưa ghim giáo trình).
    const lessonCuaBuoi = new Map(
      (
        await db.classSession.findMany({
          where: { classId: { in: classIds } },
          select: { id: true, lessonId: true },
        })
      ).map((r) => [r.id, r.lessonId]),
    );

    for (const b of buoiList) {
      if (b.daHuy) continue; // buổi huỷ không có bài tập để làm
      const lessonId = lessonCuaBuoi.get(b.id) ?? null;
      const a = lessonId ? byLesson.get(lessonId) : undefined;
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
        assignment = {
          id: a.id,
          title: a.title,
          dueAt: due?.toISOString() ?? null,
          nhanHan: due ? nhanNgayVn(due) : "",
          done,
          closed,
          overdue,
        };
      }
      items.push({
        // Khoá theo BUỔI, không theo bài: hai buổi cùng bài (buổi bù) là hai dòng khác nhau.
        key: b.id,
        order: b.soBuoi,
        title: b.tieuDe || "Buổi học",
        nhan: b.nhanDayDu || "Buổi học",
        nhanNgay: b.nhanNgay,
        sessionDate: b.ngayISO,
        taught: b.daDienRa,
        assignment,
      });
    }
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

/** `dd/MM/yyyy` theo lịch VN — Server Component chạy UTC trên Vercel, đừng format ở đó. */
function nhanNgayVn(d: Date): string {
  const p = vnParts(d);
  return `${String(p.day).padStart(2, "0")}/${String(p.month + 1).padStart(2, "0")}/${p.year}`;
}
