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
import type { SubmissionStatus } from "@prisma/client";
import { auth } from "@/lib/auth";
import { resolveActor } from "@/lib/auth/actor";
import { scopedDb } from "@/lib/db-scope";
import { isSessionEvalRoundApplicable } from "@/lib/eval/session-eval";
import {
  REPORT_CARD_STATUS_LABEL,
  canEditReportCardContent,
  type ReportCardStatusValue,
} from "@/lib/lms/report-card-core";
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

  // ── #2 "Bài chưa chấm": bài HV đã NỘP chờ chấm (SUBMITTED/LATE, chưa GRADED)
  // của lớp mình. AssignmentSubmission KHÔNG ∈ SCOPED_MODELS → cách ly qua
  // assignment.classId ∈ assignedClassIds (KHÔNG theo cơ sở). NOT_SUBMITTED/GRADED
  // không tính (khớp computeAssignmentSummary: SUBMITTED/LATE/GRADED = "đã nộp").
  const gradingWhere = {
    status: { in: ["SUBMITTED", "LATE"] as SubmissionStatus[] },
    assignment: { classId: { in: classIds } },
  };
  const [gradingCount, gradingRows] = await Promise.all([
    sdb.assignmentSubmission.count({ where: gradingWhere }),
    sdb.assignmentSubmission.findMany({
      where: gradingWhere,
      select: {
        id: true,
        student: { select: { name: true } }, // câu 46: CHỈ tên HV, KHÔNG contact PH
        assignment: { select: { title: true, class: { select: { name: true } } } },
      },
      orderBy: { submittedAt: "asc" },
      take: 5,
    }),
  ]);

  // ── #3 "Đánh giá học viên": đợt SESSION_EVAL đang MỞ áp cho lớp mình. ──
  // EvaluationRound ∈ SCOPE_EXEMPT (centerId null = toàn hệ thống) → không auto-scope;
  // cách ly bằng cách CHỈ so khớp với TỪNG lớp mình qua isSessionEvalRoundApplicable
  // (dùng centerId/courseId của lớp — reuse helper thuần lib/eval/session-eval).
  const myClasses = await sdb.class.findMany({
    where: { id: { in: classIds } },
    select: { id: true, name: true, centerId: true, courseId: true },
  });
  const openEvalRounds = await sdb.evaluationRound.findMany({
    where: { scope: "SESSION_EVAL", status: "OPEN" },
    select: {
      id: true,
      name: true,
      scope: true,
      status: true,
      opensAt: true,
      closesAt: true,
      centerId: true,
      courseId: true,
    },
    orderBy: { createdAt: "desc" },
  });
  const evalNow = new Date();
  const evalItems = myClasses.flatMap((cls) =>
    openEvalRounds
      .filter((r) =>
        isSessionEvalRoundApplicable(
          r,
          { centerId: cls.centerId, courseId: cls.courseId },
          evalNow,
        ),
      )
      .map((r) => ({ key: `${r.id}:${cls.id}`, primary: cls.name, secondary: `Đợt: ${r.name}` })),
  );

  // ── #4 "Hồ sơ port": học bạ lớp mình GV còn hoàn thiện được (DRAFT/RECALLED). ──
  // ReportCard ∈ SCOPE_EXEMPT (enrollmentId phẳng, không quan hệ) → lấy enrollment
  // của lớp mình trước (Enrollment auto-scope theo cơ sở), rồi lọc học bạ theo
  // enrollmentId + trạng thái GV sửa-được (isReportCardEditable → DRAFT/RECALLED).
  // GV chỉ hoàn thiện được học bạ mình SỬA-ĐƯỢC: DRAFT (viết nháp). RECALLED cần
  // capability 'review' (QL cơ sở/Toại — #17) → KHÔNG phải việc của GV, không vào TODO.
  const reportCardTodoStatus = (
    ["DRAFT", "PENDING_REVIEW", "PUBLISHED", "RECALLED"] as ReportCardStatusValue[]
  ).filter((s) => canEditReportCardContent(s, ["manage"]));
  const myEnrollments = await sdb.enrollment.findMany({
    where: { classId: { in: classIds }, deletedAt: null },
    select: {
      id: true,
      class: { select: { name: true } },
      student: { select: { name: true } }, // câu 46: chỉ tên HV
    },
  });
  const enrollmentIds = myEnrollments.map((e) => e.id);
  const enrollmentById = new Map(myEnrollments.map((e) => [e.id, e]));
  const reportCards = await sdb.reportCard.findMany({
    where: { enrollmentId: { in: enrollmentIds }, status: { in: reportCardTodoStatus } },
    select: { id: true, enrollmentId: true, status: true },
    orderBy: { updatedAt: "asc" },
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
    {
      id: "grading",
      title: "Bài chưa chấm",
      description: "Bài tập học viên đã nộp, chờ bạn chấm.",
      count: gradingCount,
      items: gradingRows.map((s) => ({
        key: s.id,
        primary: s.student.name,
        secondary: [s.assignment.class.name, s.assignment.title].filter(Boolean).join(" · "),
      })),
      emptyText: "Không có bài chờ chấm.",
    },
    {
      id: "evaluation",
      title: "Đánh giá học viên",
      description: "Đợt đánh giá buổi học đang mở, áp cho lớp bạn.",
      count: evalItems.length,
      items: evalItems.slice(0, 5),
      emptyText: "Không có đợt đánh giá đang mở.",
    },
    {
      id: "report-card",
      title: "Hồ sơ port",
      description: "Hồ sơ/học bạ học viên cần hoàn thiện để bàn giao.",
      count: reportCards.length,
      items: reportCards.slice(0, 5).map((c) => {
        const enr = enrollmentById.get(c.enrollmentId);
        return {
          key: c.id,
          primary: enr?.student.name ?? "Học viên",
          secondary: [
            enr?.class.name ? `Lớp ${enr.class.name}` : null,
            `Học bạ: ${REPORT_CARD_STATUS_LABEL[c.status]}`,
          ]
            .filter(Boolean)
            .join(" · "),
        };
      }),
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
