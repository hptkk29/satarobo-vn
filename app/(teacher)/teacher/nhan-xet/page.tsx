// app/(teacher)/teacher/nhan-xet/page.tsx — #06 (L6): "Nhận xét buổi học".
//
// Visual PORT từ mock satarobo-ui-giaovien (class-hub tab Nhận xét + evaluation-form)
// rút về tone neutral + shadcn của repo thật. 3 mức điều hướng qua searchParams:
//   (a) không tham số   → grid lớp mình (assignedClassIds) + đếm buổi 14 ngày gần.
//   (b) ?classId=…      → buổi [−14 ngày, hôm nay] (trừ CANCELLED, mới nhất trước)
//                         + badge "đã nhận xét x/y HV".
//   (c) ?…&sessionId=…  → FeedbackPanel: nhận xét + chấm sao từng HV ĐI HỌC.
//
// Guard (FIX #3 — 08/2026): theo OWNERSHIP BUỔI (isSessionOwnedByTeacher: lớp ∈
// assignedClassIds ∪ dạy thay substituteTeacherId ∪ thực dạy actualTeacherId) — khớp
// gate canManageSessionRecord của action saveSessionFeedback + gate điểm danh. GV dạy
// thay thấy lớp/buổi mình dạy thay ở grid (a)/(b) và nhận xét được ở (c).
// StudentSessionFeedback ∉ SCOPED_MODELS → sdb pass-through SAU khi đã guard buổi.
// ⚠️ Câu 46: payload client CHỈ tên HV — không SĐT/email/tên PH.
import Link from "next/link";
import { Ban, BookOpen, CalendarX2, MessageSquare } from "lucide-react";
import { auth } from "@/lib/auth";
import { resolveActor } from "@/lib/auth/actor";
import { scopedDb } from "@/lib/db-scope";
import { cn } from "@/lib/utils";
import { ENROLLMENT_ACTIVE_STATUS_LIST } from "@/lib/enrollment-status";
import {
  deriveFeedbackRoster,
  summarizeSessionFeedback,
} from "@/lib/lms/session-feedback-roster";
import { isSessionOwnedByTeacher } from "@/lib/lms/session-ownership";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "../_components/ui/page-header";
import { EmptyState } from "../_components/ui/empty-state";
import { SESSION_STATUS_LABEL } from "../_components/ui/session-status-pill";
import { FeedbackPanel, type FeedbackPanelRow } from "./_components/feedback-panel";
import { BackLink } from "../_components/ui/back-link";

export const metadata = { title: "Nhận xét buổi học | Giáo viên Sata Robo" };

const dayFmt = new Intl.DateTimeFormat("vi-VN", {
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
  timeZone: "Asia/Ho_Chi_Minh",
});

/** Cửa sổ buổi hiển thị: 14 ngày gần nhất tính cả hôm nay. */
function recentWindow(): { from: Date; to: Date } {
  const from = new Date();
  from.setDate(from.getDate() - 14);
  from.setHours(0, 0, 0, 0);
  const to = new Date();
  to.setHours(23, 59, 59, 999);
  return { from, to };
}

export default async function TeacherFeedbackPage({
  searchParams,
}: {
  searchParams: Promise<{ classId?: string; sessionId?: string }>;
}) {
  const session = await auth();
  if (!session?.user) return null; // layout đã gate

  const { classId, sessionId } = await searchParams;
  const userId = session.user.id;
  const actor = await resolveActor(userId);
  const sdb = scopedDb(actor);
  const classIds = [...actor.assignedClassIds];
  const { from, to } = recentWindow();

  // ── (c) Phiếu nhận xét từng HV của 1 buổi ─────────────────────────────────────
  if (classId && sessionId) {
    const sess = await sdb.classSession.findUnique({
      where: { id: sessionId },
      select: {
        id: true,
        classId: true,
        centerId: true, // model scoped — findUnique lọc hậu kỳ theo field này
        substituteTeacherId: true,
        actualTeacherId: true,
        date: true,
        topic: true,
        status: true,
        class: { select: { name: true } },
      },
    });
    // FIX #3 — gate theo ownership BUỔI (assigned ∪ dạy thay ∪ thực dạy), khớp action;
    // sessionId phải thuộc ĐÚNG lớp trên URL — chống IDOR.
    if (
      !sess ||
      sess.classId !== classId ||
      !isSessionOwnedByTeacher(sess, { userId, assignedClassIds: actor.assignedClassIds })
    ) {
      return <NotYours />;
    }

    const [attRows, enrRows, fbRows] = await Promise.all([
      sdb.attendance.findMany({
        where: { sessionId },
        select: { studentId: true, status: true, student: { select: { name: true } } },
        orderBy: { student: { name: "asc" } },
      }),
      // Fallback khi buổi chưa điểm danh: toàn bộ roster active của lớp.
      sdb.enrollment.findMany({
        where: { classId, status: { in: ENROLLMENT_ACTIVE_STATUS_LIST } },
        select: { student: { select: { id: true, name: true } } },
        orderBy: { student: { name: "asc" } },
      }),
      sdb.studentSessionFeedback.findMany({
        where: { classSessionId: sessionId },
        select: { studentId: true, comment: true, rating: true },
      }),
    ]);

    const { attendanceTaken, students } = deriveFeedbackRoster(
      attRows.map((a) => ({ studentId: a.studentId, studentName: a.student.name, status: a.status })),
      enrRows.map((e) => ({ studentId: e.student.id, studentName: e.student.name })),
    );
    const fbByStudent = new Map(fbRows.map((f) => [f.studentId, f]));
    // Câu 46: CHỈ tên HV vào payload client — không SĐT/email/tên PH.
    const rows: FeedbackPanelRow[] = students.map((s) => ({
      studentId: s.studentId,
      studentName: s.studentName,
      existingComment: fbByStudent.get(s.studentId)?.comment ?? "",
      existingRating: fbByStudent.get(s.studentId)?.rating ?? null,
    }));

    return (
      <div>
        <BackLink className="mb-4" href={`?classId=${classId}`} label="Buổi học của lớp" />
        <PageHeader
          title={`Nhận xét — ${sess.class.name}`}
          subtitle={`${dayFmt.format(sess.date)}${sess.topic ? ` · ${sess.topic}` : ""} · ${SESSION_STATUS_LABEL[sess.status] ?? sess.status}`}
        />
        {!attendanceTaken && (
          <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
            Buổi chưa điểm danh — đang hiện toàn bộ lớp.
          </p>
        )}
        <FeedbackPanel
          sessionId={sessionId}
          rows={rows}
          editable={sess.status !== "CANCELLED"}
        />
      </div>
    );
  }

  // ── (b) Buổi gần đây của 1 lớp ────────────────────────────────────────────────
  // FIX #3 — GV dạy thay: lớp KHÔNG được phân công vẫn vào được, nhưng CHỈ thấy các
  // buổi mình dạy thay/thực dạy trong cửa sổ; lớp lạ hoàn toàn → rơi xuống grid (a) như cũ.
  const classAssigned = classId ? actor.assignedClassIds.has(classId) : false;
  const classSessions = classId
    ? await sdb.classSession.findMany({
        where: {
          classId,
          date: { gte: from, lte: to },
          status: { not: "CANCELLED" },
          ...(classAssigned
            ? {}
            : { OR: [{ substituteTeacherId: userId }, { actualTeacherId: userId }] }),
        },
        select: { id: true, date: true, topic: true, status: true },
        orderBy: { date: "desc" },
      })
    : [];

  if (classId && (classAssigned || classSessions.length > 0)) {
    const cls = await sdb.class.findUnique({ where: { id: classId }, select: { name: true } });
    const sessions = classSessions;

    // Badge "đã nhận xét x/y HV": gom Attendance + feedback của các buổi trong 1 lượt.
    const ids = sessions.map((s) => s.id);
    const attRows = ids.length
      ? await sdb.attendance.findMany({
          where: { sessionId: { in: ids } },
          select: { sessionId: true, studentId: true, status: true },
        })
      : [];
    const fbRows = ids.length
      ? await sdb.studentSessionFeedback.findMany({
          where: { classSessionId: { in: ids } },
          select: { classSessionId: true, studentId: true },
        })
      : [];
    const attBySession = new Map<string, { studentId: string; status: string }[]>();
    for (const a of attRows) {
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

    return (
      <div>
        <BackLink className="mb-4" href="?" label="Nhận xét buổi học" />
        <PageHeader
          title={cls?.name ?? "Lớp"}
          subtitle="Chọn buổi trong 14 ngày gần đây để nhận xét học viên."
        />
        {sessions.length === 0 ? (
          <EmptyState
            icon={CalendarX2}
            title="Lớp không có buổi học nào trong 14 ngày gần đây."
          />
        ) : (
          <div className="space-y-2">
            {sessions.map((s) => {
              const stat = summarizeSessionFeedback(
                attBySession.get(s.id) ?? [],
                fbBySession.get(s.id) ?? [],
              );
              return (
                // href CHỈ-query (giữ path hiện tại): chạy đúng cả trên host giaovien
                // (clean URL /nhan-xet) LẪN localhost/preview (path thật /teacher/nhan-xet).
                <Link
                  key={s.id}
                  href={`?classId=${classId}&sessionId=${s.id}`}
                  className="t-card t-card-hover flex items-center justify-between gap-3 px-4 py-3 outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">{dayFmt.format(s.date)}</p>
                    {s.topic && <p className="truncate text-xs text-muted-foreground">{s.topic}</p>}
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
                    {stat.attendanceTaken ? (
                      <Badge
                        variant="outline"
                        className={cn(
                          stat.complete
                            ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-600/15 dark:text-emerald-200"
                            : "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/15 dark:text-amber-300",
                        )}
                      >
                        Đã nhận xét {stat.reviewed}/{stat.attended} HV
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-muted-foreground">
                        Chưa điểm danh
                      </Badge>
                    )}
                    <Badge variant="outline">{SESSION_STATUS_LABEL[s.status] ?? s.status}</Badge>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ── (a) Danh sách lớp được phân + lớp có buổi dạy thay ──────────────────────
  // FIX #3 — thêm lớp mình DẠY THAY/THỰC DẠY trong cửa sổ (ngoài assignedClassIds)
  // để GV dạy thay có lối vào nhận xét; badge lớp dạy thay đếm SỐ BUỔI mình dạy thay.
  const subRows = await sdb.classSession.findMany({
    where: {
      date: { gte: from, lte: to },
      status: { not: "CANCELLED" },
      OR: [{ substituteTeacherId: userId }, { actualTeacherId: userId }],
    },
    select: { classId: true },
  });
  const subCount = new Map<string, number>();
  for (const s of subRows) {
    if (actor.assignedClassIds.has(s.classId)) continue;
    subCount.set(s.classId, (subCount.get(s.classId) ?? 0) + 1);
  }
  const allClassIds = [...classIds, ...subCount.keys()];
  const classes = allClassIds.length
    ? await sdb.class.findMany({
        where: { id: { in: allClassIds } },
        select: {
          id: true,
          name: true,
          _count: {
            select: {
              sessions: { where: { date: { gte: from, lte: to }, status: { not: "CANCELLED" } } },
            },
          },
        },
        orderBy: { name: "asc" },
      })
    : [];

  return (
    <div>
      <PageHeader
        title="Nhận xét buổi học"
        subtitle="Chọn lớp → chọn buổi → nhận xét + chấm sao từng học viên đi học."
      />
      {classes.length === 0 ? (
        <EmptyState icon={BookOpen} title="Bạn chưa được phân công lớp nào." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
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
                  <MessageSquare
                    className="h-[18px] w-[18px] text-orange-600 dark:text-orange-400"
                    aria-hidden
                  />
                </span>
              </div>
              <p className="text-sm text-muted-foreground">
                {subCount.has(c.id)
                  ? `${subCount.get(c.id)} buổi dạy thay trong 14 ngày gần đây`
                  : `${c._count.sessions} buổi trong 14 ngày gần đây`}
              </p>
              <p className="mt-auto text-sm font-semibold text-orange-600 dark:text-orange-400">
                Nhận xét →
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function NotYours() {
  return (
    <div>
      <BackLink className="mb-4" href="?" label="Nhận xét buổi học" />
      <EmptyState icon={Ban} title="Buổi học không thuộc lớp bạn phụ trách." />
    </div>
  );
}
