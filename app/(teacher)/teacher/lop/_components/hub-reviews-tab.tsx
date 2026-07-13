// hub-reviews-tab.tsx — Tab "Nhận xét" của Class Hub (2 mức inline).
//
//   · List:  buổi 14 ngày gần của lớp + badge "đã nhận xét x/y HV".
//   · Detail (?rvSession=): phiếu nhận xét từng HV ĐI HỌC của buổi — comment + sao
//     1-5 (FeedbackPanel, TÁI DÙNG action saveSessionFeedback self-gated). Chưa điểm
//     danh → hiện toàn roster + banner cảnh báo. Back về list = ?classId&tab=nhan-xet.
//
// Guard: sessionId phải thuộc ĐÚNG classId (đã ∈ assignedClassIds ở caller) — chống
// IDOR. StudentSessionFeedback ∉ SCOPED_MODELS → sdb pass-through SAU guard classId.
// ⚠️ Câu 46: payload client CHỈ tên HV — không SĐT/email/tên PH.
import Link from "next/link";
import { ArrowLeft, Ban, CalendarX2 } from "lucide-react";
import type { Actor } from "@/lib/auth/actor";
import { scopedDb } from "@/lib/db-scope";
import { ENROLLMENT_ACTIVE_STATUS_LIST } from "@/lib/enrollment-status";
import {
  deriveFeedbackRoster,
  summarizeSessionFeedback,
} from "@/lib/lms/session-feedback-roster";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "../../_components/ui/empty-state";
import { FeedbackPanel, type FeedbackPanelRow } from "../../nhan-xet/_components/feedback-panel";

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

  // ── Detail: phiếu nhận xét từng HV của 1 buổi ────────────────────────────────
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

    const [attRows, enrCls, fbRows] = await Promise.all([
      sdb.attendance.findMany({
        where: { sessionId: reviewSessionId },
        select: { studentId: true, status: true, student: { select: { name: true } } },
        orderBy: { student: { name: "asc" } },
      }),
      // Fallback roster khi buổi CHƯA điểm danh — đọc QUA quan hệ class (đã guard):
      // enrollment dev có centerId=null → query thẳng sdb.enrollment bị scopedDb lọc
      // mất (rỗng) → panel trống. Đọc qua class khớp pattern hoc-vien/bai-tap tab.
      sdb.class.findUnique({
        where: { id: classId },
        select: {
          enrollments: {
            where: { status: { in: ENROLLMENT_ACTIVE_STATUS_LIST } },
            select: { student: { select: { id: true, name: true } } },
            orderBy: { student: { name: "asc" } },
          },
        },
      }),
      sdb.studentSessionFeedback.findMany({
        where: { classSessionId: reviewSessionId },
        select: { studentId: true, comment: true, rating: true },
      }),
    ]);

    const { attendanceTaken, students } = deriveFeedbackRoster(
      attRows.map((a) => ({ studentId: a.studentId, studentName: a.student.name, status: a.status })),
      (enrCls?.enrollments ?? []).map((e) => ({ studentId: e.student.id, studentName: e.student.name })),
    );
    const fbByStudent = new Map(fbRows.map((f) => [f.studentId, f]));
    const rows: FeedbackPanelRow[] = students.map((s) => ({
      studentId: s.studentId,
      studentName: s.studentName,
      existingComment: fbByStudent.get(s.studentId)?.comment ?? "",
      existingRating: fbByStudent.get(s.studentId)?.rating ?? null,
    }));

    return (
      <div>
        <BackToList classId={classId} />
        <div className="mb-4">
          <h2 className="text-lg font-bold text-foreground">{sess.topic ?? "Buổi học"}</h2>
          <p className="text-sm text-muted-foreground">
            {dayFmt.format(sess.date)} · {SESSION_STATUS_LABEL[sess.status] ?? sess.status}
          </p>
        </div>
        {!attendanceTaken && (
          <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
            Buổi chưa điểm danh — đang hiện toàn bộ lớp.
          </p>
        )}
        <FeedbackPanel
          sessionId={reviewSessionId}
          rows={rows}
          editable={sess.status !== "CANCELLED"}
        />
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
