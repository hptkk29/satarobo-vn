// hub-sessions-tab.tsx — Tab "Điểm danh" của Class Hub.
//
// Bảng buổi giàu thông tin (port SessionsTab reference TeachUI): BUỔI HỌC (topic +
// Phòng) / NGÀY·GIỜ / ĐIỂM DANH (Có mặt X/Y) / TRẠNG THÁI / THAO TÁC.
// Có mặt = PRESENT + LATE (khớp FEEDBACK_ATTENDED_STATUSES). "canMark" = buổi đã tới
// ngày (≤ hết hôm nay giờ VN) → buổi tương lai khoá "Chưa tới giờ".
//
// Đọc qua withMakeupException(actor) như lop/page.tsx (GV dạy bù liên cơ sở vẫn thấy
// đúng buổi). Caller đã guard classId ∈ assignedClassIds. THAO TÁC link ?classId&
// sessionId (query-only) → về level (c) AttendancePanel của page.tsx.
import Link from "next/link";
import { CalendarX2, ClipboardCheck, CircleCheck, Clock } from "lucide-react";
import type { AttendanceStatus } from "@prisma/client";
import type { Actor } from "@/lib/auth/actor";
import { withMakeupException } from "@/lib/db-scope";
import { ENROLLMENT_ACTIVE_STATUS_LIST } from "@/lib/enrollment-status";
import { EmptyState } from "../../_components/ui/empty-state";
import { SessionStatusPill } from "../../_components/ui/session-status-pill";

const dayFmt = new Intl.DateTimeFormat("vi-VN", {
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
  timeZone: "Asia/Ho_Chi_Minh",
});

const VN_OFFSET_MS = 7 * 60 * 60 * 1000; // Asia/Ho_Chi_Minh (UTC+7, không DST)

/** Mốc hết ngày hôm nay (giờ VN) dạng UTC — để biết buổi "đã tới ngày". */
function vnTodayEndMs(now = new Date()): number {
  const vn = new Date(now.getTime() + VN_OFFSET_MS);
  const startUtc =
    Date.UTC(vn.getUTCFullYear(), vn.getUTCMonth(), vn.getUTCDate()) -
    VN_OFFSET_MS;
  return startUtc + 24 * 60 * 60 * 1000;
}

const ATTENDED: AttendanceStatus[] = ["PRESENT", "LATE"];

export async function HubSessionsTab({
  actor,
  classId,
  timeLabel,
}: {
  actor: Actor;
  classId: string;
  timeLabel: string;
}) {
  const xdb = withMakeupException(actor);

  const [sessions, cls] = await Promise.all([
    xdb.classSession.findMany({
      where: { classId },
      select: {
        id: true,
        date: true,
        topic: true,
        status: true,
        room: { select: { code: true, name: true } },
      },
      orderBy: { date: "desc" },
      take: 60,
    }),
    xdb.class.findUnique({
      where: { id: classId },
      select: {
        _count: {
          select: {
            enrollments: {
              where: { status: { in: ENROLLMENT_ACTIVE_STATUS_LIST } },
            },
          },
        },
      },
    }),
  ]);
  const rosterCount = cls?._count.enrollments ?? 0;

  // Điểm danh theo buổi: buổi có ≥1 bản ghi = đã điểm danh; đếm PRESENT+LATE = có mặt.
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
    if (ATTENDED.includes(a.status)) {
      presentBy.set(a.sessionId, (presentBy.get(a.sessionId) ?? 0) + 1);
    }
  }
  const todayEnd = vnTodayEndMs();

  if (sessions.length === 0) {
    return <EmptyState icon={CalendarX2} title="Lớp chưa có buổi học nào." />;
  }

  return (
    <div className="t-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-[660px] w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              <th scope="col" className="px-5 py-3">
                Buổi học
              </th>
              <th scope="col" className="px-5 py-3">
                Ngày · Giờ
              </th>
              <th scope="col" className="px-5 py-3">
                Điểm danh
              </th>
              <th scope="col" className="px-5 py-3">
                Trạng thái
              </th>
              <th scope="col" className="px-5 py-3 text-right">
                <span className="sr-only">Thao tác</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {sessions.map((s) => {
              const canMark =
                s.date.getTime() <= todayEnd && s.status !== "CANCELLED";
              const done = doneSet.has(s.id);
              const present = presentBy.get(s.id) ?? 0;
              const roomLabel = s.room?.code ?? s.room?.name ?? null;
              return (
                <tr
                  key={s.id}
                  className="border-b border-border/60 transition-colors last:border-0 hover:bg-muted/50"
                >
                  <td className="px-5 py-3.5">
                    <p className="font-semibold text-foreground">
                      {s.topic ?? "Buổi học"}
                    </p>
                    {roomLabel && (
                      <p className="text-xs text-muted-foreground">
                        Phòng {roomLabel}
                      </p>
                    )}
                  </td>
                  <td className="px-5 py-3.5 whitespace-nowrap">
                    <p className="text-foreground">{dayFmt.format(s.date)}</p>
                    {timeLabel && (
                      <p className="text-xs text-muted-foreground">
                        {timeLabel}
                      </p>
                    )}
                  </td>
                  <td className="px-5 py-3.5 whitespace-nowrap">
                    {done ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-state-success-soft px-2.5 py-1 text-xs font-semibold text-state-success-ink">
                        <CircleCheck className="h-3.5 w-3.5" aria-hidden />
                        Có mặt {present}/{rosterCount}
                      </span>
                    ) : !canMark ? (
                      <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground">
                        Chưa diễn ra
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-state-warning-soft px-2.5 py-1 text-xs font-semibold text-state-warning-ink">
                        Chưa điểm danh
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3.5 whitespace-nowrap">
                    <SessionStatusPill status={s.status} />
                  </td>
                  <td className="px-5 py-3.5 text-right whitespace-nowrap">
                    {!canMark ? (
                      <span className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground">
                        <Clock className="h-3.5 w-3.5" aria-hidden /> Chưa tới
                        giờ
                      </span>
                    ) : (
                      <Link
                        href={`?classId=${classId}&sessionId=${s.id}`}
                        className={
                          done
                            ? "inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-foreground outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
                            : "inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white outline-none transition-colors hover:bg-primary-darker focus-visible:ring-2 focus-visible:ring-ring"
                        }
                      >
                        <ClipboardCheck className="h-3.5 w-3.5" aria-hidden />
                        {done ? "Xem buổi" : "Điểm danh"}
                      </Link>
                    )}
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
