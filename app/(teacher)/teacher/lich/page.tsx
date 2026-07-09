// app/(teacher)/teacher/lich/page.tsx — L6: "Lịch dạy" (phiếu GV câu 47).
//
// Buổi dạy trong khoảng [hôm nay−3, hôm nay+28] (giờ VN), gom theo NGÀY. Lọc theo
// actor.assignedClassIds (lớp GV được phân) qua scopedDb — KHÔNG theo cơ sở. Có kèm
// buổi GV dạy thay/thực dạy (substituteTeacherId/actualTeacherId = userId) TRONG các
// cơ sở GV nhìn thấy (scopedDb vẫn cách ly cơ sở; buổi dạy bù LIÊN cơ sở nằm ngoài
// slice này — cần luồng makeup-exception, xem deviation).
//
// ⚠️ Câu 46: KHÔNG hiển thị SĐT/email/contact phụ huynh — chỉ thông tin lớp + buổi.
import type { SessionStatus } from "@prisma/client";
import { auth } from "@/lib/auth";
import { resolveActor } from "@/lib/auth/actor";
import { scopedDb } from "@/lib/db-scope";
import type { VariantProps } from "class-variance-authority";
import { Badge, badgeVariants } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata = { title: "Lịch dạy | Giáo viên Sata Robo" };

const VN_OFFSET_MS = 7 * 60 * 60 * 1000; // Asia/Ho_Chi_Minh (UTC+7, không DST)
const DAY_MS = 24 * 60 * 60 * 1000;
const DAYS_BACK = 3; // buổi COMPLETED gần đây
const DAYS_FORWARD = 28; // ~4 tuần tới

/** Khoảng [hôm nay−back, hôm nay+forward] theo giờ tường VN → mốc UTC query Timestamptz. */
function vnScheduleRange(now = new Date()): { from: Date; to: Date } {
  const vn = new Date(now.getTime() + VN_OFFSET_MS);
  const startTodayUtc =
    Date.UTC(vn.getUTCFullYear(), vn.getUTCMonth(), vn.getUTCDate()) - VN_OFFSET_MS;
  return {
    from: new Date(startTodayUtc - DAYS_BACK * DAY_MS),
    to: new Date(startTodayUtc + (DAYS_FORWARD + 1) * DAY_MS),
  };
}

const timeFmt = new Intl.DateTimeFormat("vi-VN", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Ho_Chi_Minh",
});
const dayFmt = new Intl.DateTimeFormat("vi-VN", {
  weekday: "long",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "Asia/Ho_Chi_Minh",
});
/** Khóa nhóm theo NGÀY (giờ VN) — "YYYY-MM-DD" ổn định để group + sort. */
const dayKeyFmt = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: "Asia/Ho_Chi_Minh",
});

type BadgeVariant = NonNullable<VariantProps<typeof badgeVariants>["variant"]>;

const SESSION_STATUS: Record<SessionStatus, { label: string; variant: BadgeVariant }> = {
  SCHEDULED: { label: "Đã lên lịch", variant: "secondary" },
  IN_PROGRESS: { label: "Đang diễn ra", variant: "default" },
  COMPLETED: { label: "Đã dạy", variant: "outline" },
  CANCELLED: { label: "Đã hủy", variant: "destructive" },
};

export default async function TeacherSchedulePage() {
  const session = await auth();
  if (!session?.user) return null; // layout đã gate — guard cho type-narrow

  const actor = await resolveActor(session.user.id);
  const sdb = scopedDb(actor);
  const classIds = [...actor.assignedClassIds];
  const assigned = new Set(classIds);
  const { from, to } = vnScheduleRange();

  // Buổi của lớp mình HOẶC buổi mình dạy thay/thực dạy (userId). scopedDb vẫn ép
  // cách ly cơ sở (ClassSession ∈ SCOPED_MODELS) nên buổi dạy thay chỉ hiện trong
  // cơ sở GV nhìn thấy — dạy bù LIÊN cơ sở ngoài phạm vi slice này.
  const sessions = await sdb.classSession.findMany({
    where: {
      date: { gte: from, lt: to },
      OR: [
        { classId: { in: classIds } },
        { substituteTeacherId: session.user.id },
        { actualTeacherId: session.user.id },
      ],
    },
    select: {
      id: true,
      classId: true,
      date: true,
      topic: true,
      status: true,
      class: { select: { name: true, startTime: true, endTime: true } },
    },
    orderBy: { date: "asc" },
    take: 500,
  });

  // Gom theo NGÀY (giờ VN), giữ thứ tự tăng dần (query đã orderBy date asc).
  const groups: { key: string; label: string; sessions: typeof sessions }[] = [];
  const byKey = new Map<string, (typeof groups)[number]>();
  for (const s of sessions) {
    const key = dayKeyFmt.format(s.date);
    let g = byKey.get(key);
    if (!g) {
      g = { key, label: dayFmt.format(s.date), sessions: [] };
      byKey.set(key, g);
      groups.push(g);
    }
    g.sessions.push(s);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-neutral-900">Lịch dạy</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Buổi dạy của bạn từ {DAYS_BACK} ngày trước đến {DAYS_FORWARD} ngày tới — gồm cả
          buổi dạy thay trong cơ sở của bạn.
        </p>
      </div>

      {groups.length === 0 ? (
        <div className="rounded-xl border border-dashed border-neutral-300 bg-white p-10 text-center">
          <p className="text-sm text-neutral-500">
            Không có buổi dạy nào trong khoảng thời gian này.
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {groups.map((g) => (
            <section key={g.key} className="space-y-2">
              <h2 className="text-sm font-semibold capitalize text-neutral-700">{g.label}</h2>
              <div className="space-y-2">
                {g.sessions.map((s) => {
                  const st = SESSION_STATUS[s.status];
                  const time =
                    s.class.startTime && s.class.endTime
                      ? `${s.class.startTime}–${s.class.endTime}`
                      : timeFmt.format(s.date);
                  const isSubstitute = !assigned.has(s.classId);
                  return (
                    <Card key={s.id}>
                      <CardHeader className="pb-2">
                        <div className="flex items-center justify-between gap-2">
                          <CardTitle className="text-base">{s.class.name}</CardTitle>
                          <div className="flex shrink-0 items-center gap-1.5">
                            {isSubstitute && <Badge variant="outline">Dạy thay</Badge>}
                            <Badge variant={st.variant}>{st.label}</Badge>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="pt-0">
                        <p className="text-sm text-neutral-600">{time}</p>
                        {s.topic && (
                          <p className="mt-0.5 text-sm text-neutral-500">{s.topic}</p>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
