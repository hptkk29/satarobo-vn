import "server-only";
import { db } from "@/lib/db";
import { sessionTimeRange } from "@/lib/classes/slots";

// Portal v2 — dữ liệu trang Lịch học (1 con đang chọn). Ownership: caller truyền studentId
// đã verify (requireActiveStudent). KHÔNG nhận studentId qua URL.

export type ScheduleSession = {
  id: string;
  order: number | null;
  title: string;
  dateISO: string;
  time: string;
  room: string | null;
  teacher: string | null;
  status: string;
  attended: "PRESENT" | "ABSENT" | "LATE" | "EXCUSED" | null;
};

export type StudentSchedule = {
  studentName: string;
  courseName: string | null;
  className: string | null;
  rate: number;
  done: number;
  total: number;
  remaining: number;
  next: ScheduleSession | null;
  thisWeek: ScheduleSession[];
  upcoming: ScheduleSession[];
};

function startOfWeek(d: Date): Date {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7; // Mon=0
  x.setDate(x.getDate() - day);
  x.setHours(0, 0, 0, 0);
  return x;
}

export async function getStudentSchedule(studentId: string): Promise<StudentSchedule | null> {
  const student = await db.student.findUnique({ where: { id: studentId }, select: { name: true } });
  const enr = await db.enrollment.findFirst({
    where: { studentId, status: { in: ["CONFIRMED", "STUDYING", "ACTIVE"] }, deletedAt: null }, // FIX-C3
    orderBy: { createdAt: "desc" },
    select: {
      class: {
        select: {
          id: true,
          name: true,
          classCode: true,
          startTime: true,
          endTime: true,
          teacherId: true,
          roomId: true,
          course: { select: { name: true } },
        },
      },
    },
  });
  const cls = enr?.class;
  if (!student || !cls) {
    return student
      ? { studentName: student.name, courseName: null, className: null, rate: 0, done: 0, total: 0, remaining: 0, next: null, thisWeek: [], upcoming: [] }
      : null;
  }

  const [teacher, room, sessions, attendance] = await Promise.all([
    cls.teacherId ? db.user.findUnique({ where: { id: cls.teacherId }, select: { name: true } }) : null,
    cls.roomId ? db.room.findUnique({ where: { id: cls.roomId }, select: { name: true } }) : null,
    db.classSession.findMany({
      where: { classId: cls.id, status: { not: "CANCELLED" } },
      orderBy: { date: "asc" },
      select: { id: true, date: true, status: true, lesson: { select: { order: true, title: true } } },
    }),
    db.attendance.findMany({ where: { studentId, session: { classId: cls.id } }, select: { sessionId: true, status: true } }),
  ]);

  const attMap = new Map(attendance.map((a) => [a.sessionId, a.status as ScheduleSession["attended"]]));
  // Giờ tính THEO TỪNG BUỔI: lớp dùng Kế hoạch lịch học nhiều giai đoạn thì mỗi giai
  // đoạn một khung giờ, một chuỗi `time` chung cho cả khoá là sai từ ngày đổi ca.
  const timeOf = (d: Date) => {
    const r = sessionTimeRange(d, cls.startTime, cls.endTime);
    return r.end ? `${r.start} - ${r.end}` : r.start;
  };
  const teacherName = teacher?.name ?? null;
  const roomName = room?.name ?? null;

  const all: ScheduleSession[] = sessions.map((s) => ({
    id: s.id,
    order: s.lesson?.order ?? null,
    title: s.lesson?.title ? `Buổi ${s.lesson.order}: ${s.lesson.title}` : "Buổi học",
    dateISO: s.date.toISOString(),
    time: timeOf(s.date),
    room: roomName,
    teacher: teacherName,
    status: s.status,
    attended: attMap.get(s.id) ?? null,
  }));

  const now = new Date();
  const total = all.length;
  const done = all.filter((s) => new Date(s.dateISO) < now).length;
  const remaining = total - done;
  const recorded = attendance.length;
  const present = attendance.filter((a) => a.status === "PRESENT" || a.status === "LATE").length;
  const rate = recorded > 0 ? Math.round((present / recorded) * 100) : 0;

  const future = all.filter((s) => new Date(s.dateISO) >= now);
  const next = future[0] ?? null;

  const wkStart = startOfWeek(now);
  const wkEnd = new Date(wkStart);
  wkEnd.setDate(wkStart.getDate() + 7);
  const thisWeek = all.filter((s) => {
    const d = new Date(s.dateISO);
    return d >= wkStart && d < wkEnd;
  });

  return {
    studentName: student.name,
    courseName: cls.course?.name ?? null,
    className: cls.classCode,
    rate,
    done,
    total,
    remaining,
    next,
    thisWeek,
    upcoming: future.slice(0, 8),
  };
}
