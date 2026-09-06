import "server-only";
import { db } from "@/lib/db";
import { napBuoiCuaLop } from "@/lib/portal/buoi-hoc";

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
      classId: true,
      class: { select: { name: true, center: { select: { name: true } } } },
    },
  });
  if (needs.length === 0) {
    return { centerName: null, needCount: 0, pendingCount: 0, doneCount: 0, needList: [], history: [] };
  }

  const sessionIds = needs.map((n) => n.missedSessionId).filter(Boolean);
  // 06/09 — nhãn buổi lấy từ nguồn CHUNG (lib/portal/buoi-hoc.ts) thay vì in
  // `lesson.title` thô: cùng một buổi, trang Học bù và trang Nhận xét phải gọi bằng
  // cùng một tên. Bản cũ in cả ô trống `"Buổi 7"` của giáo trình lẫn tên bài mang sẵn
  // tiền tố `"Buổi 7 — "`.
  const classIds = [...new Set(needs.map((n) => n.classId).filter((x): x is string => !!x))];
  const [buoiList, attendances] = await Promise.all([
    napBuoiCuaLop(classIds, new Date()),
    db.attendance.findMany({
      where: { studentId, sessionId: { in: sessionIds } },
      select: { sessionId: true, status: true, absenceReason: true },
    }),
  ]);
  const sMap = new Map(buoiList.map((b) => [b.id, b]));
  const aMap = new Map(attendances.map((a) => [a.sessionId, a]));

  const items: MakeupItem[] = needs.map((n) => {
    const s = sMap.get(n.missedSessionId);
    const a = aMap.get(n.missedSessionId);
    return {
      id: n.id,
      lessonTitle: s?.nhanDayDu || "Buổi học",
      missedDate: s?.ngayISO ?? null,
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
