// app/(teacher)/teacher/diem-danh/page.tsx — MÀN "Điểm danh" xuyên lớp (site GV).
//
// Port reference :3001 (satarobo-ui-giaovien attendance/page.tsx): 1 bảng gộp mọi buổi
// ĐÃ DIỄN RA của các lớp mình + tìm kiếm + lọc lớp + lọc tình trạng; bấm 1 buổi → mở
// bảng điểm danh chi tiết (/teacher/lop?classId&sessionId — AttendancePanel level c).
//
// Server-first: fetch sessions + đếm điểm danh qua withMakeupException(actor) (GV dạy
// bù liên cơ sở vẫn thấy đúng buổi mình phụ trách); truyền rows plain xuống client cho
// search/filter. Cách ly cơ sở + own-class do assignedClassIds + scopedDb gác.
// ⚠️ Câu 46: rows chỉ có metadata buổi + đếm — không chạm dữ liệu HV/PH.
import { auth } from "@/lib/auth";
import { resolveActor } from "@/lib/auth/actor";
import { withMakeupException } from "@/lib/db-scope";
import { ENROLLMENT_ACTIVE_STATUS_LIST } from "@/lib/enrollment-status";
import type { AttendanceStatus } from "@prisma/client";
import { PageHeader } from "../_components/ui/page-header";
import { EmptyState } from "../_components/ui/empty-state";
import { ClipboardCheck } from "lucide-react";
import { AttendanceOverview, type AttendanceRow } from "./_components/attendance-overview";

export const metadata = { title: "Điểm danh | Giáo viên Sata Robo" };

const dayFmt = new Intl.DateTimeFormat("vi-VN", {
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
  timeZone: "Asia/Ho_Chi_Minh",
});

const VN_OFFSET_MS = 7 * 60 * 60 * 1000;
function vnTodayEndMs(now = new Date()): number {
  const vn = new Date(now.getTime() + VN_OFFSET_MS);
  const startUtc = Date.UTC(vn.getUTCFullYear(), vn.getUTCMonth(), vn.getUTCDate()) - VN_OFFSET_MS;
  return startUtc + 24 * 60 * 60 * 1000;
}

const ATTENDED: AttendanceStatus[] = ["PRESENT", "LATE"];

export default async function TeacherAttendanceOverviewPage() {
  const session = await auth();
  if (!session?.user) return null; // layout đã gate

  const actor = await resolveActor(session.user.id);
  const xdb = withMakeupException(actor);
  const classIds = [...actor.assignedClassIds];

  const classes = classIds.length
    ? await xdb.class.findMany({
        where: { id: { in: classIds } },
        select: {
          id: true,
          name: true,
          startTime: true,
          endTime: true,
          _count: {
            select: { enrollments: { where: { status: { in: ENROLLMENT_ACTIVE_STATUS_LIST } } } },
          },
        },
      })
    : [];
  const clsInfo = new Map(
    classes.map((c) => [
      c.id,
      {
        name: c.name,
        roster: c._count.enrollments,
        time: c.startTime && c.endTime ? `${c.startTime}-${c.endTime}` : "",
      },
    ]),
  );

  const todayEnd = vnTodayEndMs();
  const sessions = classIds.length
    ? await xdb.classSession.findMany({
        where: {
          classId: { in: classIds },
          status: { not: "CANCELLED" },
          date: { lte: new Date(todayEnd) },
        },
        select: { id: true, classId: true, date: true, topic: true, status: true },
        orderBy: { date: "desc" },
        take: 300,
      })
    : [];

  const ids = sessions.map((s) => s.id);
  const att = ids.length
    ? await xdb.attendance.findMany({
        where: { sessionId: { in: ids } },
        select: { sessionId: true, status: true },
      })
    : [];
  const doneSet = new Set<string>();
  const presentBy = new Map<string, number>();
  for (const a of att) {
    doneSet.add(a.sessionId);
    if (ATTENDED.includes(a.status)) presentBy.set(a.sessionId, (presentBy.get(a.sessionId) ?? 0) + 1);
  }

  const rows: AttendanceRow[] = sessions.map((s) => {
    const info = clsInfo.get(s.classId);
    return {
      id: s.id,
      classId: s.classId,
      className: info?.name ?? "Lớp",
      date: dayFmt.format(s.date),
      time: info?.time ?? "",
      topic: s.topic ?? "Buổi học",
      done: doneSet.has(s.id),
      present: presentBy.get(s.id) ?? 0,
      roster: info?.roster ?? 0,
    };
  });

  return (
    <div>
      <PageHeader
        title="Điểm danh"
        subtitle="Theo dõi điểm danh các buổi đã diễn ra ở lớp bạn phụ trách. Bấm một buổi để mở bảng điểm danh chi tiết."
      />
      {rows.length === 0 ? (
        <EmptyState icon={ClipboardCheck} title="Chưa có buổi học nào đã diễn ra." />
      ) : (
        <AttendanceOverview rows={rows} />
      )}
    </div>
  );
}
