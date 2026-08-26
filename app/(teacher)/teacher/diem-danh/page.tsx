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
import { summarizeSessionFeedback } from "@/lib/lms/session-feedback-roster";
import {
  attendanceCoversRoster,
  buildSessionMediaCoverage,
  buildSessionNumberMap,
  mediaCoversAttendees,
  SESSION_MEDIA_SELECT,
  type SessionMediaRow,
  compareSessionWorkOrder,
  isSessionSettled,
} from "@/lib/lms/session-order";
import { deriveSessionLabel } from "@/lib/lms/session-project-name";
import type { AttendanceStatus } from "@prisma/client";
import { PageHeader } from "../_components/ui/page-header";
import { EmptyState } from "../_components/ui/empty-state";
import { ClipboardCheck } from "lucide-react";
import {
  AttendanceOverview,
  type AttendanceRow,
} from "./_components/attendance-overview";

export const metadata = { title: "Điểm danh | Giáo viên Sata Robo" };

// 21/08 — CÓ `year`: bảng này gộp buổi của MỌI lớp mình dạy nên rất dễ có hai buổi
// cùng ngày-tháng khác năm nằm cạnh nhau.
const dayFmt = new Intl.DateTimeFormat("vi-VN", {
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "Asia/Ho_Chi_Minh",
});

const VN_OFFSET_MS = 7 * 60 * 60 * 1000;
function vnTodayEndMs(now = new Date()): number {
  const vn = new Date(now.getTime() + VN_OFFSET_MS);
  const startUtc =
    Date.UTC(vn.getUTCFullYear(), vn.getUTCMonth(), vn.getUTCDate()) -
    VN_OFFSET_MS;
  return startUtc + 24 * 60 * 60 * 1000;
}

const ATTENDED: AttendanceStatus[] = ["PRESENT", "LATE"];

/** studentId của học viên ĐI HỌC (PRESENT/LATE) trong một buổi — em vắng không tính. */
function attendedIdsOf(rows: { studentId: string; status: string }[]): string[] {
  return rows.filter((a) => ATTENDED.includes(a.status as AttendanceStatus)).map((a) => a.studentId);
}


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
            select: {
              enrollments: {
                where: { status: { in: ENROLLMENT_ACTIVE_STATUS_LIST } },
              },
            },
          },
          // Sĩ số theo DANH SÁCH studentId — cần cho attendanceCoversRoster. Lọc
          // deletedAt ở cả enrollment lẫn student; `_count` ngay trên KHÔNG lọc và giữ
          // nguyên vì nó là mẫu số của cột "Có mặt X/Y" đã có từ trước.
          enrollments: {
            where: {
              status: { in: ENROLLMENT_ACTIVE_STATUS_LIST },
              deletedAt: null,
              student: { deletedAt: null },
            },
            select: { studentId: true },
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
        rosterIds: c.enrollments.map((e) => e.studentId),
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
        select: {
          id: true,
          classId: true,
          date: true,
          topic: true,
          status: true,
          // 25/08 — nguồn NHÃN BUỔI "Buổi 1 - HP1 - Bàn Tay Ma Thuật"
          // (lib/lms/session-project-name · deriveSessionLabel).
          plan: { select: { customTitle: true } },
          lesson: { select: { order: true, title: true, moduleCode: true } },
        },
        orderBy: { date: "desc" },
        take: 300,
      })
    : [];

  const ids = sessions.map((s) => s.id);
  // R1 — số buổi tính trên TOÀN BỘ buổi của từng lớp, không phải trên cửa sổ 300 dòng
  // đã lọc `date <= hôm nay` ở trên (lib/lms/session-order).
  const [att, fbRows, mediaRows, allSessions] = await Promise.all([
    ids.length
      ? xdb.attendance.findMany({
          where: { sessionId: { in: ids } },
          select: { sessionId: true, studentId: true, status: true },
        })
      : Promise.resolve([] as { sessionId: string; studentId: string; status: AttendanceStatus }[]),
    ids.length
      ? xdb.studentSessionFeedback.findMany({
          where: { classSessionId: { in: ids } },
          select: { classSessionId: true, studentId: true },
        })
      : Promise.resolve([] as { classSessionId: string; studentId: string }[]),
    // Ảnh: tính cả DRAFT/PENDING, chỉ loại REJECTED (khớp hub-reviews-tab).
    ids.length
      ? xdb.classSessionMedia.findMany({
          where: { classSessionId: { in: ids }, status: { not: "REJECTED" } },
          select: SESSION_MEDIA_SELECT,
        })
      : Promise.resolve([] as SessionMediaRow[]),
    classIds.length
      ? xdb.classSession.findMany({
          where: { classId: { in: classIds } },
          select: { id: true, classId: true, date: true },
        })
      : Promise.resolve([] as { id: string; classId: string; date: Date }[]),
  ]);

  const numberOf = buildSessionNumberMap(allSessions);
  const doneSet = new Set<string>();
  const presentBy = new Map<string, number>();
  const attBySession = new Map<string, { studentId: string; status: string }[]>();
  for (const a of att) {
    doneSet.add(a.sessionId);
    if (ATTENDED.includes(a.status))
      presentBy.set(a.sessionId, (presentBy.get(a.sessionId) ?? 0) + 1);
    const list = attBySession.get(a.sessionId) ?? [];
    list.push({ studentId: a.studentId, status: a.status });
    attBySession.set(a.sessionId, list);
  }
  const fbBySession = new Map<string, string[]>();
  for (const f of fbRows) {
    const list = fbBySession.get(f.classSessionId) ?? [];
    list.push(f.studentId);
    fbBySession.set(f.classSessionId, list);
  }
  // Ai đã có ảnh, theo TỪNG buổi (lib/lms/session-order).
  const mediaBy = buildSessionMediaCoverage(mediaRows);

  // R2 — sắp xếp Ở SERVER: AttendanceOverview (client) chỉ lọc/tìm, không sort lại.
  //
  // Khác các tab trong Class Hub, bảng này GỘP nhiều lớp. Xếp thuần theo số buổi sẽ dồn
  // "Buổi 1" của mọi lớp vào một chỗ và giáo viên không đọc được lớp nào đang dở tới đâu.
  // Nên chèn tên lớp làm khoá GIỮA: chưa-xong-việc trước → gom theo lớp → thứ tự buổi.
  const rows: AttendanceRow[] = sessions
    .map((s) => {
      const info = clsInfo.get(s.classId);
      const stat = summarizeSessionFeedback(
        attBySession.get(s.id) ?? [],
        fbBySession.get(s.id) ?? [],
      );
      const no = numberOf.get(s.id) ?? null;
      const markedIds = (attBySession.get(s.id) ?? []).map((a) => a.studentId);
      const roster = info?.roster ?? 0;
      return {
        row: {
          id: s.id,
          classId: s.classId,
          className: info?.name ?? "Lớp",
          sessionLabel:
            deriveSessionLabel({
              sessionNumber: no,
              planTitle: s.plan?.customTitle,
              lessonTitle: s.lesson?.title,
              lessonOrder: s.lesson?.order,
              moduleCode: s.lesson?.moduleCode,
              topic: s.topic,
            }) || "Buổi học",
          date: dayFmt.format(s.date),
          time: info?.time ?? "",
          done: doneSet.has(s.id),
          present: presentBy.get(s.id) ?? 0,
          roster,
        } satisfies AttendanceRow,
        no,
        complete: isSessionSettled({
          cancelled: s.status === "CANCELLED",
          rosterEmpty: (info?.rosterIds ?? []).length === 0,
          work: {
            attendanceDone: attendanceCoversRoster(markedIds, info?.rosterIds ?? []),
            feedbackDone: stat.complete,
            photoDone: mediaCoversAttendees({
              attendedStudentIds: attendedIdsOf(attBySession.get(s.id) ?? []),
              taggedStudentIds: mediaBy.get(s.id)?.tagged ?? [],
              hasClassWide: mediaBy.get(s.id)?.classWide ?? false,
            }),
          },
        }),
      };
    })
    .sort(
      (a, b) =>
        compareSessionWorkOrder(
          { number: null, complete: a.complete },
          { number: null, complete: b.complete },
        ) ||
        a.row.className.localeCompare(b.row.className, "vi") ||
        compareSessionWorkOrder(
          { number: a.no, complete: false },
          { number: b.no, complete: false },
        ),
    )
    .map((r) => r.row);

  return (
    <div>
      <PageHeader
        title="Điểm danh"
        subtitle="Theo dõi điểm danh các buổi đã diễn ra ở lớp bạn phụ trách. Bấm một buổi để mở bảng điểm danh chi tiết."
      />
      {rows.length === 0 ? (
        <EmptyState
          icon={ClipboardCheck}
          title="Chưa có buổi học nào đã diễn ra."
        />
      ) : (
        <AttendanceOverview rows={rows} />
      )}
    </div>
  );
}
