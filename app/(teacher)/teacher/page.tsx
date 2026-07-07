// app/(teacher)/teacher/page.tsx — L5: trang chủ site GV = khu "Việc chưa xong"
// (phiếu GV câu 45: buổi chưa điểm danh · bài chưa chấm · đánh giá học viên ·
// hồ sơ port — ưu tiên hiển thị ngay khi mở trang).
//
// SKELETON có cấu trúc cho Vy (UI) + L6 (data): mục 1 lấy DATA THẬT (buổi
// SCHEDULED hôm nay của lớp mình theo actor.assignedClassIds, qua scopedDb);
// 3 mục còn lại là placeholder có cấu trúc — L6 điền query, Vy điền UI.
//
// ⚠️ Câu 46: GV KHÔNG xem SĐT/email phụ huynh. Trang này không chạm dữ liệu PH;
// trang nào sau này hiển thị học viên/PH PHẢI mask theo canViewParentContact
// (lib/auth/permissions.ts) — không đưa contact PH vào payload gửi client.
import { auth } from "@/lib/auth";
import { resolveActor } from "@/lib/auth/actor";
import { scopedDb } from "@/lib/db-scope";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata = { title: "Việc chưa xong | Giáo viên Sata Robo" };

const VN_OFFSET_MS = 7 * 60 * 60 * 1000; // Asia/Ho_Chi_Minh (UTC+7, không DST)

/** [00:00, 24:00) hôm nay theo giờ tường VN, trả về mốc UTC để query Timestamptz. */
function vnTodayRange(now = new Date()): { from: Date; to: Date } {
  const vn = new Date(now.getTime() + VN_OFFSET_MS);
  const startUtc =
    Date.UTC(vn.getUTCFullYear(), vn.getUTCMonth(), vn.getUTCDate()) - VN_OFFSET_MS;
  return { from: new Date(startUtc), to: new Date(startUtc + 24 * 60 * 60 * 1000) };
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

/**
 * Hợp đồng dữ liệu 1 khu "việc chưa xong" — Vy render theo shape này, L6 thay
 * `pending: null` bằng query thật (giữ nguyên field để UI không phải sửa).
 */
type PendingSection = {
  id: string;
  title: string;
  description: string;
  /** null = L6 chưa nối data (hiện "Sắp có"); số = badge đếm việc tồn. */
  count: number | null;
  items: { key: string; primary: string; secondary: string }[];
  emptyText: string;
};

export default async function TeacherHomePage() {
  const session = await auth();
  if (!session?.user) return null; // layout đã gate — guard cho type-narrow

  const actor = await resolveActor(session.user.id);
  const sdb = scopedDb(actor);
  const classIds = [...actor.assignedClassIds];
  const { from, to } = vnTodayRange();

  // Buổi SCHEDULED hôm nay của lớp mình (teacherId/assistantId → assignedClassIds).
  // L6: mở rộng thành "chưa điểm danh/chưa hoàn tất" (ckAttendance, lifecycle v2)
  // + buổi dạy thay/bù liên cơ sở (exception MAKEUP — KHÔNG lọc theo cơ sở).
  const todaySessions =
    classIds.length === 0
      ? []
      : await sdb.classSession.findMany({
          where: {
            classId: { in: classIds },
            status: "SCHEDULED",
            date: { gte: from, lt: to },
          },
          select: {
            id: true,
            date: true,
            topic: true,
            class: { select: { name: true, startTime: true, endTime: true } },
          },
          orderBy: { date: "asc" },
        });

  const sections: PendingSection[] = [
    {
      id: "attendance",
      title: "Buổi chưa điểm danh",
      description: "Buổi học hôm nay của lớp bạn chưa hoàn tất điểm danh.",
      count: todaySessions.length,
      items: todaySessions.map((s) => ({
        key: s.id,
        primary: s.class.name,
        secondary: [
          s.class.startTime && s.class.endTime
            ? `${s.class.startTime}–${s.class.endTime}`
            : timeFmt.format(s.date),
          s.topic,
        ]
          .filter(Boolean)
          .join(" · "),
      })),
      emptyText: "Hôm nay không còn buổi nào chờ điểm danh.",
    },
    // ── Placeholder có cấu trúc — L6 nối query, giữ nguyên shape ──────────────
    {
      id: "grading",
      title: "Bài chưa chấm",
      description: "Bài tập học viên đã nộp, chờ bạn chấm.",
      count: null, // L6: đếm HomeworkAssignment status SUBMITTED của lớp mình
      items: [],
      emptyText: "Không có bài chờ chấm.",
    },
    {
      id: "evaluation",
      title: "Đánh giá học viên",
      description: "Nhận xét/đánh giá định kỳ học viên đến hạn.",
      count: null, // L6: đợt đánh giá đang mở áp cho lớp mình
      items: [],
      emptyText: "Không có đánh giá đến hạn.",
    },
    {
      id: "report-card",
      title: "Hồ sơ port",
      description: "Hồ sơ/học bạ học viên cần hoàn thiện để bàn giao.",
      count: null, // L6: report-card/hồ sơ cuối khóa còn thiếu của lớp mình
      items: [],
      emptyText: "Không có hồ sơ chờ hoàn thiện.",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-neutral-900">Việc chưa xong</h1>
        <p className="mt-1 text-sm text-neutral-500">
          {dayFmt.format(new Date())} — các việc cần xử lý, ưu tiên từ trên xuống.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {sections.map((section) => (
          <Card key={section.id}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-base">{section.title}</CardTitle>
                {section.count === null ? (
                  <Badge variant="outline" className="text-neutral-400">
                    Sắp có
                  </Badge>
                ) : (
                  <Badge variant={section.count > 0 ? "destructive" : "secondary"}>
                    {section.count}
                  </Badge>
                )}
              </div>
              <CardDescription>{section.description}</CardDescription>
            </CardHeader>
            <CardContent>
              {section.count === null ? (
                <p className="rounded-md border border-dashed border-neutral-200 p-3 text-sm text-neutral-400">
                  Đang xây (L6) — dữ liệu sẽ hiển thị tại đây.
                </p>
              ) : section.items.length === 0 ? (
                <p className="text-sm text-neutral-500">{section.emptyText}</p>
              ) : (
                <ul className="space-y-2">
                  {section.items.map((item) => (
                    <li
                      key={item.key}
                      className="rounded-md border border-neutral-200 bg-white p-3"
                    >
                      <p className="text-sm font-medium text-neutral-900">
                        {item.primary}
                      </p>
                      {item.secondary && (
                        <p className="mt-0.5 text-xs text-neutral-500">
                          {item.secondary}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
