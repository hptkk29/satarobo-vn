// hub-reviews-tab.tsx — Tab "Nhận xét" của Class Hub (2 mức inline).
//
//   · List:  buổi 14 ngày gần của lớp + badge "đã nhận xét x/y HV".
//   · Detail (?rvSession=): BẢNG học viên của buổi (Học viên / Điểm danh / Ảnh buổi
//     học / Nhận xét) — mỗi HV đi học mở PHIẾU "Nhận xét buổi học" (Dự án + 4 mục +
//     rubric 9 tiêu chí, StudentEvalDialog) + Xuất PDF. HV vắng: không nhận xét. Chưa
//     điểm danh → hiện toàn roster (banner). Back = ?classId&tab=nhan-xet.
//
// Guard: sessionId phải thuộc ĐÚNG classId (đã ∈ assignedClassIds ở caller) — chống
// IDOR. StudentSessionFeedback/Attendance ∉ SCOPED_MODELS → sdb pass-through SAU guard
// classId. Roster đọc QUA quan hệ class (enrollment dev centerId=null bị scopedDb lọc).
// ⚠️ Câu 46: payload client CHỈ tên HV — không SĐT/email/tên PH.
import Link from "next/link";
import { ArrowLeft, Ban, CalendarX2 } from "lucide-react";
import type { AttendanceStatus } from "@prisma/client";
import type { Actor } from "@/lib/auth/actor";
import { scopedDb } from "@/lib/db-scope";
import { ENROLLMENT_ACTIVE_STATUS_LIST } from "@/lib/enrollment-status";
import { summarizeSessionFeedback } from "@/lib/lms/session-feedback-roster";
import { normalizeEvalNotes, normalizeEvalRatings } from "@/lib/lms/session-eval-rubric";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "../../_components/ui/empty-state";
import { UploadPhotoDialog } from "../../anh-lop/_components/upload-photo-dialog";
import { StudentEvalDialog } from "./student-eval-dialog";

const dayFmt = new Intl.DateTimeFormat("vi-VN", {
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
  timeZone: "Asia/Ho_Chi_Minh",
});
/** "YYYY-MM-DD" (giờ VN) — nhãn ngày trong phiếu/PDF (khớp reference). */
const isoFmt = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: "Asia/Ho_Chi_Minh",
});

const SESSION_STATUS_LABEL: Record<string, string> = {
  SCHEDULED: "Đã lên lịch",
  IN_PROGRESS: "Đang diễn ra",
  COMPLETED: "Đã dạy",
  CANCELLED: "Đã hủy",
};

const ATTENDED: AttendanceStatus[] = ["PRESENT", "LATE"];
const ATT_BADGE: Record<AttendanceStatus, { label: string; cls: string }> = {
  PRESENT: {
    label: "Có mặt",
    cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-600/20 dark:text-emerald-200",
  },
  LATE: {
    label: "Đi muộn",
    cls: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  },
  ABSENT: { label: "Vắng", cls: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300" },
  EXCUSED: {
    label: "Có phép",
    cls: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300",
  },
  ABSENT_EXCUSED: {
    label: "Vắng có phép",
    cls: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300",
  },
  ABSENT_UNEXCUSED: {
    label: "Vắng",
    cls: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300",
  },
};

const initials = (name: string) =>
  name
    .split(" ")
    .slice(-2)
    .map((w) => w[0] ?? "")
    .join("")
    .toUpperCase();

/** Cửa sổ buổi: 14 ngày gần nhất tính cả hôm nay (khớp trang Nhận xét). */
function recentWindow(): { from: Date; to: Date } {
  const from = new Date();
  from.setDate(from.getDate() - 14);
  from.setHours(0, 0, 0, 0);
  const to = new Date();
  to.setHours(23, 59, 59, 999);
  return { from, to };
}

function BackToList({ classId }: { classId: string }) {
  return (
    <Link
      href={`?classId=${classId}&tab=nhan-xet`}
      className="mb-4 inline-flex items-center gap-1.5 rounded-sm text-sm text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
    >
      <ArrowLeft className="h-4 w-4" aria-hidden /> Tất cả buổi nhận xét
    </Link>
  );
}

export async function HubReviewsTab({
  actor,
  classId,
  reviewSessionId,
}: {
  actor: Actor;
  classId: string;
  reviewSessionId?: string;
}) {
  const sdb = scopedDb(actor);

  // ── Detail: bảng HV của buổi + phiếu nhận xét ────────────────────────────────
  if (reviewSessionId) {
    const sess = await sdb.classSession.findUnique({
      where: { id: reviewSessionId },
      select: {
        id: true,
        classId: true,
        centerId: true, // model scoped — findUnique lọc hậu kỳ theo field này
        date: true,
        topic: true,
        status: true,
        class: { select: { name: true, course: { select: { name: true } } } },
      },
    });
    if (!sess || sess.classId !== classId) {
      return (
        <div>
          <BackToList classId={classId} />
          <EmptyState icon={Ban} title="Buổi học không thuộc lớp bạn phụ trách." />
        </div>
      );
    }

    const [attRows, fbRows, clsRoster] = await Promise.all([
      sdb.attendance.findMany({
        where: { sessionId: reviewSessionId },
        select: { studentId: true, status: true },
      }),
      sdb.studentSessionFeedback.findMany({
        where: { classSessionId: reviewSessionId },
        select: { studentId: true, projectName: true, notes: true, rubric: true, comment: true },
      }),
      sdb.class.findUnique({
        where: { id: classId },
        select: {
          enrollments: {
            where: { status: { in: ENROLLMENT_ACTIVE_STATUS_LIST } },
            select: {
              student: { select: { id: true, name: true, studentCode: true, avatarUrl: true } },
            },
            orderBy: { student: { name: "asc" } },
          },
        },
      }),
    ]);

    const roster = (clsRoster?.enrollments ?? []).map((e) => e.student);
    const attMap = new Map(attRows.map((a) => [a.studentId, a.status]));
    const attendanceTaken = attRows.length > 0;
    const fbMap = new Map(fbRows.map((f) => [f.studentId, f]));

    const canEval = (studentId: string) =>
      !attendanceTaken || ATTENDED.includes((attMap.get(studentId) ?? "ABSENT") as AttendanceStatus);
    const evaluable = roster.filter((s) => canEval(s.id));
    const reviewed = evaluable.filter((s) => {
      const fb = fbMap.get(s.id);
      return fb && (fb.rubric != null || fb.notes != null);
    }).length;

    const courseName = sess.class.course.name;
    const topic = sess.topic ?? "Buổi học";
    const dateIso = isoFmt.format(sess.date);

    return (
      <div>
        <BackToList classId={classId} />
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-bold text-foreground">{topic}</h2>
            <p className="text-sm text-muted-foreground">
              {dateIso} · {SESSION_STATUS_LABEL[sess.status] ?? sess.status}
            </p>
          </div>
          <Badge
            variant="outline"
            className="border-orange-300 bg-orange-50 text-orange-700 dark:border-orange-500/40 dark:bg-orange-500/15 dark:text-orange-300"
          >
            Nhận xét {reviewed}/{evaluable.length}
          </Badge>
        </div>

        {!attendanceTaken && (
          <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
            Buổi chưa điểm danh — đang hiện toàn bộ lớp.
          </p>
        )}

        {roster.length === 0 ? (
          <EmptyState icon={CalendarX2} title="Lớp chưa có học viên đang học." />
        ) : (
          <div className="t-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                    <th scope="col" className="px-5 py-3">Học viên</th>
                    <th scope="col" className="px-5 py-3">Điểm danh</th>
                    <th scope="col" className="px-5 py-3">Ảnh buổi học</th>
                    <th scope="col" className="px-5 py-3 text-right">Nhận xét</th>
                  </tr>
                </thead>
                <tbody>
                  {roster.map((st) => {
                    const status = attMap.get(st.id) as AttendanceStatus | undefined;
                    const evalOk = canEval(st.id);
                    const fb = fbMap.get(st.id);
                    const done = Boolean(fb && (fb.rubric != null || fb.notes != null));
                    return (
                      <tr
                        key={st.id}
                        className={cn(
                          "border-b border-border/60 last:border-0",
                          !evalOk && "opacity-60",
                        )}
                      >
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-3">
                            {st.avatarUrl ? (
                              <img
                                src={st.avatarUrl}
                                alt={st.name}
                                className="h-10 w-10 shrink-0 rounded-full border border-border object-cover"
                              />
                            ) : (
                              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-orange-100 text-xs font-semibold text-orange-700 dark:bg-orange-500/15 dark:text-orange-300">
                                {initials(st.name)}
                              </span>
                            )}
                            <div className="min-w-0">
                              <p className="truncate font-semibold text-foreground">{st.name}</p>
                              {st.studentCode && (
                                <p className="truncate text-xs text-muted-foreground">
                                  {st.studentCode}
                                </p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-3.5 whitespace-nowrap">
                          {status ? (
                            <span
                              className={cn(
                                "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold",
                                ATT_BADGE[status].cls,
                              )}
                            >
                              {ATT_BADGE[status].label}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-5 py-3.5">
                          {evalOk ? (
                            <UploadPhotoDialog
                              classId={classId}
                              initialSessionId={reviewSessionId}
                              initialTagged={[st.id]}
                              compact
                            />
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          {evalOk ? (
                            <StudentEvalDialog
                              sessionId={reviewSessionId}
                              studentId={st.id}
                              studentName={st.name}
                              courseName={courseName}
                              sessionTopic={topic}
                              sessionDate={dateIso}
                              existing={
                                done && fb
                                  ? {
                                      projectName: fb.projectName,
                                      notes: normalizeEvalNotes(fb.notes),
                                      rubric: normalizeEvalRatings(fb.rubric),
                                    }
                                  : null
                              }
                              done={done}
                              pdfHref={`/teacher/nhan-xet/pdf/${reviewSessionId}/${st.id}`}
                            />
                          ) : (
                            <span className="text-xs font-medium text-muted-foreground">
                              Vắng — không nhận xét
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── List: buổi 14 ngày gần của lớp ───────────────────────────────────────────
  const { from, to } = recentWindow();
  const sessions = await sdb.classSession.findMany({
    where: { classId, date: { gte: from, lte: to }, status: { not: "CANCELLED" } },
    select: { id: true, date: true, topic: true, status: true },
    orderBy: { date: "desc" },
  });

  const ids = sessions.map((s) => s.id);
  const [attRows, fbRows] = await Promise.all([
    ids.length
      ? sdb.attendance.findMany({
          where: { sessionId: { in: ids } },
          select: { sessionId: true, studentId: true, status: true },
        })
      : Promise.resolve([] as { sessionId: string; studentId: string; status: string }[]),
    ids.length
      ? sdb.studentSessionFeedback.findMany({
          where: { classSessionId: { in: ids } },
          select: { classSessionId: true, studentId: true },
        })
      : Promise.resolve([] as { classSessionId: string; studentId: string }[]),
  ]);
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

  if (sessions.length === 0) {
    return (
      <EmptyState icon={CalendarX2} title="Lớp không có buổi học nào trong 14 ngày gần đây." />
    );
  }

  return (
    <div className="space-y-2">
      {sessions.map((s) => {
        const stat = summarizeSessionFeedback(
          attBySession.get(s.id) ?? [],
          fbBySession.get(s.id) ?? [],
        );
        return (
          <Link
            key={s.id}
            href={`?classId=${classId}&tab=nhan-xet&rvSession=${s.id}`}
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
  );
}
