import "server-only";
import { db } from "@/lib/db";
import { getStudentSchedule } from "@/lib/portal/schedule";
import { getStudentSessionsView } from "@/lib/portal/student-sessions";
import { getStudentMakeup } from "@/lib/portal/makeup";
import { getStudentAssignmentTrack } from "@/lib/portal/student-assignments";
import { getStudentExams, getStudentAssignmentResults } from "@/lib/portal/learning";

// Portal v2 — Tổng quan "Cổng học sinh" (student-mode): tiến độ + hành trình + việc cần
// làm + lớp tiếp theo + kỹ năng + kết quả gần đây (giống SataUI).

const DONE_EXAM = new Set(["SUBMITTED", "GRADED"]);

export type JourneyDot = { idx: number; status: "done" | "today" | "makeup" | "absent" | "future"; title: string | null };
export type StudentTodo = { id: string; kind: "BÀI TẬP" | "KIỂM TRA"; title: string; meta: string; overdue: boolean; href: string };
export type SkillBar = { label: string; pct: number };
export type ResultRow = { title: string; score: number; total: number };
export type NextClass = { title: string; time: string | null; room: string | null; teacher: string | null; label: string; isToday: boolean };

export type StudentHome = {
  studentName: string;
  courseName: string | null;
  className: string | null;
  teacher: string | null;
  done: number;
  total: number;
  progressPct: number;
  attendanceRate: number;
  pendingCount: number;
  nextLabel: string | null;
  nextIsToday: boolean;
  // Hành trình + 6 ô tổng hợp
  remaining: number;
  present: number;
  absent: number;
  makeupNeed: number;
  makeupDone: number;
  journey: JourneyDot[];
  // Việc cần làm
  todos: StudentTodo[];
  // Lớp học tiếp theo
  nextClass: NextClass | null;
  // Kỹ năng + kết quả
  skills: SkillBar[];
  results: ResultRow[];
  avgScore: number | null;
};

const SKILL_LABEL: Record<string, string> = {
  MECH_ASSEMBLY: "Lắp ráp cơ khí",
  ALGORITHM: "Tư duy logic",
  PROGRAMMING: "Lập trình",
  SENSOR: "Cảm biến",
  MOTOR_CONTROL: "Điều khiển động cơ",
  PROBLEM_SOLVING: "Giải quyết vấn đề",
  TEAMWORK: "Hợp tác nhóm",
  PRESENTATION: "Thuyết trình",
  CREATIVITY: "Sáng tạo",
  COMPETITION_READY: "Sẵn sàng thi đấu",
};
const SKILL_PCT: Record<string, number> = { NEED_SUPPORT: 45, BASIC: 65, GOOD: 82, EXCELLENT: 95 };

function dmy(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

export async function getStudentHome(studentId: string): Promise<StudentHome> {
  const [sched, view, makeup, track, exams, results, skillRows, student, enr] = await Promise.all([
    getStudentSchedule(studentId),
    getStudentSessionsView(studentId),
    getStudentMakeup(studentId),
    getStudentAssignmentTrack(studentId).catch(() => null),
    getStudentExams(studentId).catch(() => []),
    getStudentAssignmentResults(studentId).catch(() => []),
    db.studentSkillAssessment.findMany({ where: { studentId }, orderBy: { assessedAt: "desc" }, select: { skill: true, level: true } }),
    db.student.findUnique({ where: { id: studentId }, select: { name: true } }),
    db.enrollment.findFirst({ where: { studentId }, orderBy: { enrolledAt: "desc" }, select: { class: { select: { teacher: { select: { name: true } } } } } }),
  ]);

  const total = view.total;
  const done = view.done;
  const remaining = Math.max(0, total - done);
  const progressPct = total > 0 ? Math.round((done / total) * 100) : 0;

  // Hành trình: trạng thái từng buổi.
  const journey: JourneyDot[] = view.sessions.map((s) => {
    let status: JourneyDot["status"];
    if (s.today) status = "today";
    else if (s.attendance === "MAKEUP") status = "makeup";
    else if (s.attendance === "ABSENT" || s.attendance === "EXCUSED") status = "absent";
    else if (s.past) status = "done";
    else status = "future";
    return { idx: s.order, status, title: s.title };
  });

  // Việc cần làm: bài tập chưa nộp + bài kiểm tra chưa làm.
  const todos: StudentTodo[] = [];
  for (const it of track?.items ?? []) {
    if (it.assignment && !it.assignment.done) {
      todos.push({
        id: it.assignment.id,
        kind: "BÀI TẬP",
        title: it.assignment.title,
        meta: `Buổi ${it.order} · Hạn ${dmy(it.assignment.dueAt)}`,
        overdue: it.assignment.overdue,
        href: `/portal/bai-tap/${it.assignment.id}`,
      });
    }
  }
  for (const e of exams) {
    if (!DONE_EXAM.has(e.attemptStatus ?? "")) {
      todos.push({
        id: e.id,
        kind: "KIỂM TRA",
        title: e.title,
        meta: `${e.durationMinutes} phút${e.closeAt ? ` · Hạn ${dmy(e.closeAt)}` : ""}`,
        overdue: false,
        href: `/portal/bai-thi/${e.id}`,
      });
    }
  }
  todos.sort((a, b) => Number(b.overdue) - Number(a.overdue));

  // Lớp học tiếp theo.
  const n = sched?.next ?? null;
  const nextIsTodayClass = n ? new Date(n.dateISO).toDateString() === new Date().toDateString() : false;
  const nextClass: NextClass | null = n
    ? {
        title: n.title,
        time: n.time || null,
        room: n.room,
        teacher: n.teacher,
        label: nextIsTodayClass ? "Hôm nay" : dmy(n.dateISO),
        isToday: nextIsTodayClass,
      }
    : null;

  // Kỹ năng: mức mới nhất mỗi kỹ năng → %.
  const seenSkill = new Set<string>();
  const skills: SkillBar[] = [];
  for (const r of skillRows) {
    if (seenSkill.has(r.skill)) continue;
    seenSkill.add(r.skill);
    skills.push({ label: SKILL_LABEL[r.skill] ?? r.skill, pct: SKILL_PCT[r.level] ?? 60 });
  }

  // Kết quả gần đây (bài đã chấm điểm).
  const graded = results.filter((r) => r.score != null && r.totalPoints > 0).slice(0, 4);
  const resultRows: ResultRow[] = graded.map((r) => ({ title: r.title, score: r.score as number, total: r.totalPoints }));
  const avgScore = graded.length
    ? Math.round((graded.reduce((s, r) => s + ((r.score as number) / r.totalPoints) * 10, 0) / graded.length) * 10) / 10
    : null;

  const next = view.sessions.find((s) => !s.past);
  const nextIsToday = next?.today ?? false;
  const nextLabel = next ? (next.today ? "Hôm nay" : dmy(next.date)) : null;

  return {
    studentName: student?.name ?? sched?.studentName ?? "học sinh",
    courseName: sched?.courseName ?? null,
    className: sched?.className ?? null,
    teacher: enr?.class?.teacher?.name ?? null,
    done,
    total,
    progressPct,
    attendanceRate: sched?.rate ?? 0,
    pendingCount: todos.length,
    nextLabel,
    nextIsToday,
    remaining,
    present: view.present,
    absent: view.absent,
    makeupNeed: makeup.needCount,
    makeupDone: makeup.doneCount,
    journey,
    todos,
    nextClass,
    skills,
    results: resultRows,
    avgScore,
  };
}
