// app/(teacher)/teacher/lop/page.tsx — #06 (L6): "Lớp của tôi" → điểm danh 6 nhãn (câu 50).
//
// 3 mức điều hướng qua searchParams (không cần route động):
//   (a) không tham số   → danh sách lớp GV được phân (assignedClassIds).
//   (b) ?classId=…      → các buổi gần đây của lớp đó (chỉ lớp mình — chống IDOR).
//   (c) ?…&sessionId=…  → roster điểm danh của buổi (buildSessionAttendanceRows).
//
// Cách ly cơ sở + makeup liên cơ sở: đọc qua withMakeupException(actor) để GV dạy bù
// thấy đúng buổi/lớp ở cơ sở khác; quyền sở hữu thật do assignedClassIds / ownership gác.
// ⚠️ Câu 46: roster từ server đã strip studentPhone — client CHỈ nhận tên HV.
import Link from "next/link";
import { ArrowLeft, CalendarX2 } from "lucide-react";
import { auth } from "@/lib/auth";
import { resolveActor } from "@/lib/auth/actor";
import { withMakeupException } from "@/lib/db-scope";
import { isSessionOwnedByTeacher } from "@/lib/lms/session-ownership";
import { buildSessionAttendanceRows } from "@/lib/attendance/roster";
import { ENROLLMENT_ACTIVE_STATUS_LIST } from "@/lib/enrollment-status";
import { EmptyState } from "../_components/ui/empty-state";
import { PageHeader } from "../_components/ui/page-header";
import { SessionStatusPill } from "../_components/ui/session-status-pill";
import { AttendancePanel, type AttendancePanelRow } from "./_components/attendance-panel";
import { ClassList, ClassListEmpty, type ClassRow } from "./_components/class-list";

export const metadata = { title: "Lớp của tôi | Giáo viên Sata Robo" };

const dayFmt = new Intl.DateTimeFormat("vi-VN", {
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
  timeZone: "Asia/Ho_Chi_Minh",
});

const VN_OFFSET_MS = 7 * 60 * 60 * 1000; // Asia/Ho_Chi_Minh (UTC+7, không DST)

/** Mốc hết ngày hôm nay (giờ VN) dạng UTC — để đếm buổi "đã tới ngày". */
function vnTodayEnd(now = new Date()): Date {
  const vn = new Date(now.getTime() + VN_OFFSET_MS);
  const startUtc =
    Date.UTC(vn.getUTCFullYear(), vn.getUTCMonth(), vn.getUTCDate()) - VN_OFFSET_MS;
  return new Date(startUtc + 24 * 60 * 60 * 1000);
}

/** scheduleDays: 0=CN … 6=T7 → nhãn tiếng Việt. */
const DAY_LABELS = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];

/** "T7 · 08:00-10:00" từ scheduleDays + giờ lớp. */
function scheduleText(days: number[], start: string | null, end: string | null): string {
  const d = days
    .map((x) => DAY_LABELS[x])
    .filter((x): x is string => Boolean(x))
    .join(" ");
  const t = start && end ? `${start}-${end}` : "";
  return [d, t].filter(Boolean).join(" · ");
}

export default async function TeacherClassesPage({
  searchParams,
}: {
  searchParams: Promise<{ classId?: string; sessionId?: string }>;
}) {
  const session = await auth();
  if (!session?.user) return null; // layout đã gate

  const { classId, sessionId } = await searchParams;
  const actor = await resolveActor(session.user.id);
  const xdb = withMakeupException(actor);
  const classIds = [...actor.assignedClassIds];

  // ── (c) Roster điểm danh của 1 buổi ──────────────────────────────────────────
  if (classId && sessionId && actor.assignedClassIds.has(classId)) {
    const sess = await xdb.classSession.findUnique({
      where: { id: sessionId },
      select: {
        id: true,
        classId: true,
        date: true,
        status: true,
        substituteTeacherId: true,
        actualTeacherId: true,
        class: { select: { name: true } },
      },
    });
    const owned =
      sess &&
      isSessionOwnedByTeacher(
        {
          classId: sess.classId,
          substituteTeacherId: sess.substituteTeacherId,
          actualTeacherId: sess.actualTeacherId,
        },
        { userId: session.user.id, assignedClassIds: actor.assignedClassIds },
      );

    if (!sess || !owned || sess.classId !== classId) {
      return <NotYours />;
    }

    const { rows } = await buildSessionAttendanceRows(actor, sessionId);
    // Câu 46: bỏ studentPhone khỏi payload client — chỉ giữ tên + trạng thái.
    const panelRows: AttendancePanelRow[] = rows.map((r) => ({
      studentId: r.studentId,
      studentName: r.studentName,
      enrollmentStatus: r.enrollmentStatus,
      makeupFromCenter: r.makeupFromCenter ?? null,
      existingStatus: r.existing?.status ?? null,
      existingNote: r.existing?.note ?? null,
    }));

    return (
      <div>
        <BackLink href={`?classId=${classId}`} label="Buổi học của lớp" />
        <PageHeader
          title={`Điểm danh — ${sess.class.name}`}
          subtitle={dayFmt.format(sess.date)}
          actions={<SessionStatusPill status={sess.status} />}
        />
        <AttendancePanel
          sessionId={sessionId}
          rows={panelRows}
          editable={sess.status !== "CANCELLED"}
        />
      </div>
    );
  }

  // ── (b) Các buổi của 1 lớp ────────────────────────────────────────────────────
  if (classId && actor.assignedClassIds.has(classId)) {
    const cls = await xdb.class.findUnique({ where: { id: classId }, select: { name: true } });
    const sessions = await xdb.classSession.findMany({
      where: { classId },
      select: { id: true, date: true, topic: true, status: true },
      orderBy: { date: "desc" },
      take: 40,
    });
    return (
      <div>
        <BackLink href="?" label="Lớp của tôi" />
        <PageHeader title={cls?.name ?? "Lớp"} subtitle="Chọn buổi để điểm danh." />
        {sessions.length === 0 ? (
          <EmptyState icon={CalendarX2} title="Lớp chưa có buổi học nào." />
        ) : (
          <div className="space-y-2">
            {sessions.map((s) => (
              // href CHỈ-query (giữ path hiện tại): chạy đúng cả trên host giaovien
              // (clean URL /lop) LẪN localhost/preview (path thật /teacher/lop).
              <Link
                key={s.id}
                href={`?classId=${classId}&sessionId=${s.id}`}
                className="t-card t-card-hover flex items-center justify-between gap-3 px-4 py-3 outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">
                    {dayFmt.format(s.date)}
                  </p>
                  {s.topic && (
                    <p className="truncate text-xs text-muted-foreground">{s.topic}</p>
                  )}
                </div>
                <SessionStatusPill status={s.status} />
              </Link>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── (a) Danh sách lớp được phân ───────────────────────────────────────────────
  const rawClasses = classIds.length
    ? await xdb.class.findMany({
        where: { id: { in: classIds } },
        select: {
          id: true,
          name: true,
          classCode: true,
          status: true,
          scheduleDays: true,
          startTime: true,
          endTime: true,
          maxStudents: true,
          course: { select: { name: true } },
          center: { select: { name: true } },
          _count: {
            select: {
              enrollments: { where: { status: { in: ENROLLMENT_ACTIVE_STATUS_LIST } } },
            },
          },
        },
        orderBy: { name: "asc" },
      })
    : [];

  // Cột "Cần xử lý": đếm buổi (60 ngày gần, đã tới hết hôm nay, chưa hủy) chưa có
  // bản ghi điểm danh — theo từng lớp. Cùng tín hiệu "chưa điểm danh" với dashboard.
  const todayEnd = vnTodayEnd();
  const pendFrom = new Date(todayEnd.getTime() - 60 * 24 * 60 * 60 * 1000);
  const pendSessions = classIds.length
    ? await xdb.classSession.findMany({
        where: {
          classId: { in: classIds },
          status: { not: "CANCELLED" },
          date: { gte: pendFrom, lte: todayEnd },
        },
        select: { id: true, classId: true },
      })
    : [];
  const attendedSet = new Set(
    pendSessions.length
      ? (
          await xdb.attendance.findMany({
            where: { sessionId: { in: pendSessions.map((s) => s.id) } },
            select: { sessionId: true },
          })
        ).map((a) => a.sessionId)
      : [],
  );
  const pendingByClass = new Map<string, number>();
  for (const s of pendSessions) {
    if (!attendedSet.has(s.id)) {
      pendingByClass.set(s.classId, (pendingByClass.get(s.classId) ?? 0) + 1);
    }
  }

  const rows: ClassRow[] = rawClasses.map((c) => ({
    id: c.id,
    name: c.name,
    code: c.classCode,
    center: c.center?.name ?? null,
    course: c.course.name,
    schedule: scheduleText(c.scheduleDays, c.startTime, c.endTime),
    enrolled: c._count.enrollments,
    capacity: c.maxStudents,
    status: c.status,
    pending: pendingByClass.get(c.id) ?? 0,
  }));

  return (
    <div>
      <PageHeader
        title="Lớp học của tôi"
        subtitle="Các lớp bạn đang phụ trách. Bấm vào một lớp để điểm danh, nhận xét, giao bài và xem học viên."
      />
      {rows.length === 0 ? <ClassListEmpty /> : <ClassList rows={rows} />}
    </div>
  );
}

function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="mb-4 inline-flex items-center gap-1.5 rounded-sm text-sm text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
    >
      <ArrowLeft className="h-4 w-4" aria-hidden />
      {label}
    </Link>
  );
}

function NotYours() {
  return (
    <div>
      <BackLink href="?" label="Lớp của tôi" />
      <EmptyState icon={CalendarX2} title="Buổi học không thuộc lớp bạn phụ trách." />
    </div>
  );
}
