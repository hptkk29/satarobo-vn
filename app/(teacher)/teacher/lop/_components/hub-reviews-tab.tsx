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
import { ArrowLeft, Ban, CalendarX2, ClipboardCheck, ClipboardPen } from "lucide-react";
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

const VN_OFFSET_MS = 7 * 60 * 60 * 1000; // Asia/Ho_Chi_Minh (UTC+7)
/** Mốc hết hôm nay (giờ VN) dạng ms — buổi ≤ mốc này = đã diễn ra. */
function vnTodayEndMs(now = new Date()): number {
  const vn = new Date(now.getTime() + VN_OFFSET_MS);
  const startUtc = Date.UTC(vn.getUTCFullYear(), vn.getUTCMonth(), vn.getUTCDate()) - VN_OFFSET_MS;
  return startUtc + 24 * 60 * 60 * 1000;
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
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
            <span>Buổi chưa điểm danh — đang hiện toàn bộ lớp.</span>
            <Link
              href={`?classId=${classId}&sessionId=${reviewSessionId}`}
              className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-amber-300 bg-white px-2.5 py-1 text-xs font-semibold text-amber-800 transition-colors hover:bg-amber-100 dark:border-amber-500/40 dark:bg-transparent dark:text-amber-200 dark:hover:bg-amber-500/10"
            >
              <ClipboardCheck className="h-3.5 w-3.5" aria-hidden />
              Điểm danh buổi này
            </Link>
          </div>
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

  // ── List: MỌI buổi đã diễn ra của lớp (bảng 5 cột + cột Đi học) ──────────────
  const cls = await sdb.class.findUnique({
    where: { id: classId },
    select: {
      startTime: true,
      endTime: true,
      _count: {
        select: { enrollments: { where: { status: { in: ENROLLMENT_ACTIVE_STATUS_LIST } } } },
      },
    },
  });
  const rosterCount = cls?._count.enrollments ?? 0;
  const timeLabel = cls?.startTime && cls?.endTime ? `${cls.startTime}-${cls.endTime}` : "";

  const sessions = await sdb.classSession.findMany({
    where: { classId, status: { not: "CANCELLED" }, date: { lte: new Date(vnTodayEndMs()) } },
    select: {
      id: true,
      date: true,
      topic: true,
      status: true,
      room: { select: { code: true, name: true } },
    },
    orderBy: { date: "desc" },
    take: 100,
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
    return <EmptyState icon={CalendarX2} title="Lớp chưa có buổi học nào đã diễn ra." />;
  }

  return (
    <div className="t-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              <th scope="col" className="px-5 py-3">Buổi học</th>
              <th scope="col" className="px-5 py-3">Ngày · Giờ</th>
              <th scope="col" className="px-5 py-3">Đi học</th>
              <th scope="col" className="px-5 py-3">Nhận xét</th>
              <th scope="col" className="px-5 py-3 text-right">
                <span className="sr-only">Thao tác</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {sessions.map((s) => {
              const stat = summarizeSessionFeedback(
                attBySession.get(s.id) ?? [],
                fbBySession.get(s.id) ?? [],
              );
              const roomLabel = s.room?.code ?? s.room?.name ?? null;
              return (
                <tr
                  key={s.id}
                  className="border-b border-border/60 transition-colors last:border-0 hover:bg-muted/50"
                >
                  <td className="px-5 py-3.5">
                    <p className="font-semibold text-foreground">{s.topic ?? "Buổi học"}</p>
                    {roomLabel && <p className="text-xs text-muted-foreground">Phòng {roomLabel}</p>}
                  </td>
                  <td className="px-5 py-3.5 whitespace-nowrap">
                    <p className="text-foreground">{dayFmt.format(s.date)}</p>
                    {timeLabel && <p className="text-xs text-muted-foreground">{timeLabel}</p>}
                  </td>
                  <td className="px-5 py-3.5 whitespace-nowrap font-semibold text-foreground">
                    {stat.attendanceTaken ? `${stat.attended}/${rosterCount}` : "—"}
                  </td>
                  <td className="px-5 py-3.5 whitespace-nowrap">
                    {!stat.attendanceTaken ? (
                      <Badge variant="outline" className="text-muted-foreground">
                        Chưa điểm danh
                      </Badge>
                    ) : stat.complete ? (
                      <Badge
                        variant="outline"
                        className="border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-600/15 dark:text-emerald-200"
                      >
                        Đã nhận xét
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/15 dark:text-amber-300"
                      >
                        {stat.reviewed}/{stat.attended} HV
                      </Badge>
                    )}
                  </td>
                  <td className="px-5 py-3.5 text-right whitespace-nowrap">
                    <Link
                      href={`?classId=${classId}&tab=nhan-xet&rvSession=${s.id}`}
                      className={
                        stat.complete
                          ? "inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-foreground outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
                          : "inline-flex items-center gap-1.5 rounded-lg bg-orange-600 px-3 py-1.5 text-xs font-semibold text-white outline-none transition-colors hover:bg-orange-700 focus-visible:ring-2 focus-visible:ring-ring"
                      }
                    >
                      <ClipboardPen className="h-3.5 w-3.5" aria-hidden />
                      {stat.complete ? "Xem lại" : "Nhận xét"}
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
