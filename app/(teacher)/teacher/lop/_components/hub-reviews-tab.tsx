// hub-reviews-tab.tsx — Tab "Nhận xét" của Class Hub.
//
// List buổi 14 ngày gần của lớp + badge "đã nhận xét x/y HV" (summarizeSessionFeedback).
// Bấm 1 buổi → phiếu nhận xét chi tiết ở trang chuyên: /teacher/nhan-xet?classId&sessionId
// (dùng lại toàn bộ FeedbackPanel + gate của trang đó, không dựng lại logic mutation).
// ⚠️ Câu 46: màn này chỉ đọc metadata buổi + đếm — không chạm contact PH.
import Link from "next/link";
import { CalendarX2 } from "lucide-react";
import type { Actor } from "@/lib/auth/actor";
import { scopedDb } from "@/lib/db-scope";
import { summarizeSessionFeedback } from "@/lib/lms/session-feedback-roster";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "../../_components/ui/empty-state";

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

export async function HubReviewsTab({
  actor,
  classId,
}: {
  actor: Actor;
  classId: string;
}) {
  const sdb = scopedDb(actor);
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
            href={`/teacher/nhan-xet?classId=${classId}&sessionId=${s.id}`}
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
