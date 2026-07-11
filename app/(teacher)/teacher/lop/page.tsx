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
import { ArrowLeft, BookOpen, CalendarX2, Users } from "lucide-react";
import { auth } from "@/lib/auth";
import { resolveActor } from "@/lib/auth/actor";
import { withMakeupException } from "@/lib/db-scope";
import { isSessionOwnedByTeacher } from "@/lib/lms/session-ownership";
import { buildSessionAttendanceRows } from "@/lib/attendance/roster";
import { EmptyState } from "../_components/ui/empty-state";
import { PageHeader } from "../_components/ui/page-header";
import { SessionStatusPill } from "../_components/ui/session-status-pill";
import { AttendancePanel, type AttendancePanelRow } from "./_components/attendance-panel";

export const metadata = { title: "Lớp của tôi | Giáo viên Sata Robo" };

const dayFmt = new Intl.DateTimeFormat("vi-VN", {
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
  timeZone: "Asia/Ho_Chi_Minh",
});

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
  const classes = classIds.length
    ? await xdb.class.findMany({
        where: { id: { in: classIds } },
        select: { id: true, name: true, _count: { select: { enrollments: true } } },
        orderBy: { name: "asc" },
      })
    : [];

  return (
    <div>
      <PageHeader
        title="Lớp của tôi"
        subtitle="Các lớp bạn được phân công — chọn lớp để điểm danh 6 nhãn."
      />
      {classes.length === 0 ? (
        <EmptyState icon={BookOpen} title="Bạn chưa được phân công lớp nào." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {classes.map((c) => (
            // href chỉ-query — xem ghi chú ở link buổi học.
            <Link
              key={c.id}
              href={`?classId=${c.id}`}
              className="t-card t-card-hover flex h-full flex-col gap-3 p-4 outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-base font-bold text-foreground">{c.name}</p>
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-orange-50 dark:bg-orange-500/15">
                  <BookOpen
                    className="h-[18px] w-[18px] text-orange-600 dark:text-orange-400"
                    aria-hidden
                  />
                </span>
              </div>
              <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Users className="h-4 w-4" aria-hidden />
                {c._count.enrollments} học viên
              </p>
              <p className="mt-auto text-sm font-semibold text-orange-600 dark:text-orange-400">
                Mở lớp →
              </p>
            </Link>
          ))}
        </div>
      )}
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
