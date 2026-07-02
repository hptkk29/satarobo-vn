import "server-only";
import { db } from "@/lib/db";

// Portal v2 — dữ liệu "Yêu cầu học bù" cho con đang chọn (per-child).
// Nguồn: MakeupNeed (buổi lỡ cần bù). PENDING = cần bù · SCHEDULED = đã xếp/chờ ·
// COMPLETED = đã bù xong. Lý do vắng lấy từ Attendance của buổi lỡ.

export type MakeupItem = {
  id: string;
  lessonTitle: string;
  missedDate: string | null;
  className: string;
  centerName: string | null;
  reason: string;
  status: "PENDING" | "SCHEDULED" | "COMPLETED" | "CANCELLED";
  /** Thời điểm học bù XONG (MakeupNeed.completedAt) — mốc thời gian cho feed thông báo. */
  completedAt: string | null;
};

export type StudentMakeup = {
  centerName: string | null;
  needCount: number;
  pendingCount: number;
  doneCount: number;
  needList: MakeupItem[];
  history: MakeupItem[];
};

function reasonOf(status: string | undefined, note: string | null | undefined): string {
  if (note && note.trim()) return note.trim();
  if (status === "EXCUSED" || status === "ABSENT_EXCUSED") return "Nghỉ có phép";
  if (status === "ABSENT" || status === "ABSENT_UNEXCUSED") return "Vắng không phép";
  return "Nghỉ học";
}

export async function getStudentMakeup(studentId: string): Promise<StudentMakeup> {
  const needs = await db.makeupNeed.findMany({
    where: { studentId },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      status: true,
      missedSessionId: true,
      note: true,
      completedAt: true,
      class: { select: { name: true, center: { select: { name: true } } } },
    },
  });
  if (needs.length === 0) {
    return { centerName: null, needCount: 0, pendingCount: 0, doneCount: 0, needList: [], history: [] };
  }

  const sessionIds = needs.map((n) => n.missedSessionId).filter(Boolean);
  const [sessions, attendances] = await Promise.all([
    db.classSession.findMany({
      where: { id: { in: sessionIds } },
      select: { id: true, date: true, topic: true, lesson: { select: { title: true } } },
    }),
    db.attendance.findMany({
      where: { studentId, sessionId: { in: sessionIds } },
      select: { sessionId: true, status: true, absenceReason: true },
    }),
  ]);
  const sMap = new Map(sessions.map((s) => [s.id, s]));
  const aMap = new Map(attendances.map((a) => [a.sessionId, a]));

  const items: MakeupItem[] = needs.map((n) => {
    const s = sMap.get(n.missedSessionId);
    const a = aMap.get(n.missedSessionId);
    return {
      id: n.id,
      lessonTitle: s?.lesson?.title ?? s?.topic ?? "Buổi học",
      missedDate: s?.date?.toISOString() ?? null,
      className: n.class?.name ?? "—",
      centerName: n.class?.center?.name ?? null,
      reason: reasonOf(a?.status, n.note ?? a?.absenceReason),
      status: n.status as MakeupItem["status"],
      completedAt: n.completedAt?.toISOString() ?? null,
    };
  });

  return {
    centerName: items.find((i) => i.centerName)?.centerName ?? null,
    needCount: items.filter((i) => i.status === "PENDING").length,
    pendingCount: items.filter((i) => i.status === "SCHEDULED").length,
    doneCount: items.filter((i) => i.status === "COMPLETED").length,
    needList: items.filter((i) => i.status === "PENDING"),
    history: items.filter((i) => i.status !== "PENDING"),
  };
}
