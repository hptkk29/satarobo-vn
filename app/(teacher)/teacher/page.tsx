// app/(teacher)/teacher/page.tsx — L5: trang chủ site GV = khu "Việc chưa xong"
// (phiếu GV câu 45: buổi chưa điểm danh · bài chưa chấm · đánh giá học viên ·
// hồ sơ port — ưu tiên hiển thị ngay khi mở trang).
//
// Giao diện port từ TeachUI: lời chào + hàng StatCard đếm việc tồn + 2 cột thẻ
// việc. Cả 4 mục đều lấy DATA THẬT qua scopedDb (actor.assignedClassIds).
//
// ⚠️ Câu 46: GV KHÔNG xem SĐT/email phụ huynh. Trang này không chạm dữ liệu PH;
// trang nào sau này hiển thị học viên/PH PHẢI mask theo canViewParentContact
// (lib/auth/permissions.ts) — không đưa contact PH vào payload gửi client.
import Link from "next/link";
import {
  CalendarCheck,
  CheckCircle2,
  ClipboardCheck,
  GraduationCap,
  MessageSquareText,
  type LucideIcon,
} from "lucide-react";
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
import { SuccessBanner } from "./_components/ui/empty-state";
import { StatCard, type StatTone } from "./_components/ui/stat-card";

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
  /** Trang đích xử lý việc (batch 1) — có thì hiện nút "Mở →". */
  href?: string;
  /** Icon + tone cho thẻ số liệu (UI TeachUI). */
  icon: LucideIcon;
  /** Tone khi CÒN việc; hết việc thì luôn chuyển sang xanh. */
  tone: StatTone;
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
  // EvaluationRound ∈ SCOPED_MODELS + NULL_IS_GLOBAL (#03 Pha B): auto-scope theo cơ sở,
  // round centerId=null (toàn hệ thống) vẫn hiện;
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
  // ReportCard ∈ SCOPED_MODELS (#03 Pha B — KHÔNG NULL_IS_GLOBAL) → lấy enrollment
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
      href: "/teacher/lop",
      icon: CalendarCheck,
      tone: "brand",
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
      href: "/teacher/cham-bai",
      icon: ClipboardCheck,
      tone: "amber",
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
      href: "/teacher/nhan-xet",
      icon: MessageSquareText,
      tone: "blue",
      title: "Đánh giá học viên",
      description: "Đợt đánh giá buổi học đang mở, áp cho lớp bạn.",
      count: evalItems.length,
      items: evalItems.slice(0, 5),
      emptyText: "Không có đợt đánh giá đang mở.",
    },
    {
      id: "report-card",
      href: "/teacher/hoc-ba",
      icon: GraduationCap,
      tone: "amber",
      title: "Hồ sơ học bạ",
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

  const teacherName = session.user.name ?? "thầy/cô";
  const totalPending = sections.reduce((n, s) => n + (s.count ?? 0), 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-extrabold tracking-tight text-foreground sm:text-2xl">
          Xin chào, {teacherName} 👋
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {dayFmt.format(new Date())} — các việc cần xử lý, ưu tiên từ trên xuống.
        </p>
      </div>

      {totalPending === 0 && (
        <SuccessBanner icon={CheckCircle2}>
          Đã sạch việc — không còn đầu việc nào chờ bạn xử lý hôm nay.
        </SuccessBanner>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {sections.map((s) => (
          <StatCard
            key={s.id}
            icon={s.icon}
            value={s.count ?? "—"}
            label={s.title}
            // Hết việc → xanh. Ngôn ngữ màu nhất quán: cam/amber = cần làm,
            // xanh lá = xong. Cam KHÔNG bao giờ mang nghĩa "tốt".
            tone={s.count === null ? "blue" : s.count > 0 ? s.tone : "green"}
          />
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {sections.map((section) => (
          <section key={section.id} className="t-card t-card-hover p-4 sm:p-5">
            <div className="flex items-start justify-between gap-2">
              <h2 className="text-base font-bold text-foreground">
                {section.href ? (
                  <Link
                    href={section.href}
                    className="rounded-sm outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {section.title} →
                  </Link>
                ) : (
                  section.title
                )}
              </h2>
              {section.count !== null && section.count > 0 && (
                <span className="inline-flex min-w-6 items-center justify-center rounded-full bg-orange-100 px-2 py-0.5 text-xs font-bold text-orange-700 dark:bg-orange-500/15 dark:text-orange-300">
                  {section.count}
                </span>
              )}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{section.description}</p>

            <div className="mt-3">
              {section.count === null ? (
                <p className="rounded-lg border border-dashed border-border p-3 text-sm text-muted-foreground">
                  Đang xây — dữ liệu sẽ hiển thị tại đây.
                </p>
              ) : section.items.length === 0 ? (
                <p className="text-sm text-muted-foreground">{section.emptyText}</p>
              ) : (
                <ul className="space-y-2">
                  {section.items.map((item) => (
                    <li
                      key={item.key}
                      className="rounded-lg border border-border bg-muted/40 p-3"
                    >
                      <p className="text-sm font-medium text-foreground">{item.primary}</p>
                      {item.secondary && (
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {item.secondary}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
