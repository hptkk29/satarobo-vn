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
import { auth } from "@/lib/auth";
import { resolveActor } from "@/lib/auth/actor";
import { withMakeupException } from "@/lib/db-scope";
import { isSessionOwnedByTeacher } from "@/lib/lms/session-ownership";
import { buildSessionAttendanceRows } from "@/lib/attendance/roster";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AttendancePanel, type AttendancePanelRow } from "./_components/attendance-panel";

export const metadata = { title: "Lớp của tôi | Giáo viên Sata Robo" };

const dayFmt = new Intl.DateTimeFormat("vi-VN", {
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
  timeZone: "Asia/Ho_Chi_Minh",
});

const SESSION_STATUS_LABEL: Record<string, string> = {
  SCHEDULED: "Đã lên lịch",
  IN_PROGRESS: "Đang diễn ra",
  COMPLETED: "Đã dạy",
  CANCELLED: "Đã hủy",
};

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
      <div className="space-y-4">
        <BackLink href={`/lop?classId=${classId}`} label="← Buổi học của lớp" />
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">Điểm danh — {sess.class.name}</h1>
          <p className="mt-1 text-sm text-neutral-500">
            {dayFmt.format(sess.date)} · {SESSION_STATUS_LABEL[sess.status] ?? sess.status}
          </p>
        </div>
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
      <div className="space-y-4">
        <BackLink href="/lop" label="← Lớp của tôi" />
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">{cls?.name ?? "Lớp"}</h1>
          <p className="mt-1 text-sm text-neutral-500">Chọn buổi để điểm danh.</p>
        </div>
        {sessions.length === 0 ? (
          <EmptyBox text="Lớp chưa có buổi học nào." />
        ) : (
          <div className="space-y-2">
            {sessions.map((s) => (
              <Link key={s.id} href={`/lop?classId=${classId}&sessionId=${s.id}`} className="block">
                <Card className="transition-colors hover:border-neutral-400">
                  <CardContent className="flex items-center justify-between py-3">
                    <div>
                      <p className="text-sm font-medium text-neutral-800">{dayFmt.format(s.date)}</p>
                      {s.topic && <p className="text-xs text-neutral-500">{s.topic}</p>}
                    </div>
                    <Badge variant="outline">{SESSION_STATUS_LABEL[s.status] ?? s.status}</Badge>
                  </CardContent>
                </Card>
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
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-neutral-900">Lớp của tôi</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Các lớp bạn được phân công — chọn lớp để điểm danh 6 nhãn.
        </p>
      </div>
      {classes.length === 0 ? (
        <EmptyBox text="Bạn chưa được phân công lớp nào." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {classes.map((c) => (
            <Link key={c.id} href={`/lop?classId=${c.id}`} className="block">
              <Card className="h-full transition-colors hover:border-neutral-400">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">{c.name}</CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <p className="text-sm text-neutral-500">{c._count.enrollments} học viên</p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="text-sm text-neutral-500 hover:text-neutral-800">
      {label}
    </Link>
  );
}

function EmptyBox({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-neutral-300 bg-white p-10 text-center">
      <p className="text-sm text-neutral-500">{text}</p>
    </div>
  );
}

function NotYours() {
  return (
    <div className="space-y-4">
      <BackLink href="/lop" label="← Lớp của tôi" />
      <EmptyBox text="Buổi học không thuộc lớp bạn phụ trách." />
    </div>
  );
}
