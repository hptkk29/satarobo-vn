// app/(teacher)/teacher/hoc-vien/page.tsx — Hồ sơ học viên site GV.
//
// Port cấu trúc reference :3001 (satarobo-ui-giaovien students/[id]/student-profile):
// hồ sơ = 4 TAB (Điểm danh / Nhận xét / Bài tập & Kiểm tra / Học bạ), điều hướng qua
// searchParams (?s=<id>&ptab=…) — server-first, mỗi tab fetch riêng.
//   (a) không tham số → grid HV các lớp mình (client search + lọc lớp).
//   (b) ?s=<id>       → hồ sơ 4 tab.
//
// Guard IDOR: HV phải có ghi danh (mọi status, chưa xoá) trong lớp ∈ assignedClassIds.
// Enrollment/ReportCard SCOPED (scopedDb tự cách ly cơ sở); StudentSessionFeedback/
// AssignmentSubmission ∉ SCOPED → guard qua classSession.classId/assignment.classId.
// Raw db CHỈ qua lib helper (attendanceSummary / getCourseCriteria).
//
// ⚠️ Câu 46: KHÔNG SĐT/email/tên phụ huynh — reference header có parentName/phone,
// KHÔNG port. Student CHỈ {id, name, studentCode, avatarUrl, dateOfBirth, currentGrade, school}.
import Link from "next/link";
import { CalendarCheck, ChevronRight, ClipboardList, ClipboardPen, CircleCheck, FileDown, GraduationCap, Lock, NotebookPen, type LucideIcon } from "lucide-react";
import type { AttendanceStatus } from "@prisma/client";
import { auth } from "@/lib/auth";
import { resolveActor } from "@/lib/auth/actor";
import { scopedDb } from "@/lib/db-scope";
import { attendanceSummary } from "@/lib/attendance/summary";
import { getCourseCriteria } from "@/lib/lms/report-card";
import { ENROLLMENT_ACTIVE_STATUS_LIST } from "@/lib/enrollment-status";
import { ENROLLMENT_STATUS } from "@/lib/labels/registry";
import { normalizeEvalNotes } from "@/lib/lms/session-eval-rubric";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "../_components/ui/empty-state";
import { PageHeader } from "../_components/ui/page-header";
import { StudentList, type StudentRow } from "./_components/student-list";
import { BackLink } from "../_components/ui/back-link";

export const metadata = { title: "Hồ sơ học viên | Giáo viên Sata Robo" };

const dayFmt = new Intl.DateTimeFormat("vi-VN", {
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
  timeZone: "Asia/Ho_Chi_Minh",
});
const dueFmt = new Intl.DateTimeFormat("vi-VN", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "Asia/Ho_Chi_Minh",
});
const LEVEL_LABEL: Record<number, string> = {
  1: "1 · Cần cố gắng",
  2: "2 · Đạt",
  3: "3 · Khá",
  4: "4 · Tốt",
};

const REPORT_STATUS: Record<string, { label: string; cls: string }> = {
  DRAFT: { label: "Học bạ nháp", cls: "bg-muted text-muted-foreground" },
  PENDING_REVIEW: {
    label: "Chờ duyệt",
    cls: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  },
  PUBLISHED: {
    label: "Đã duyệt",
    cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-600/20 dark:text-emerald-200",
  },
  RECALLED: {
    label: "Thu hồi",
    cls: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
  },
};

const ATT_BADGE: Record<AttendanceStatus, { label: string; cls: string }> = {
  PRESENT: { label: "Có mặt", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-600/20 dark:text-emerald-200" },
  LATE: { label: "Đi muộn", cls: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300" },
  ABSENT: { label: "Vắng", cls: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300" },
  EXCUSED: { label: "Có phép", cls: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300" },
  ABSENT_EXCUSED: { label: "Vắng có phép", cls: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300" },
  ABSENT_UNEXCUSED: { label: "Vắng", cls: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300" },
};

const initials = (name: string) =>
  name.split(" ").slice(-2).map((w) => w[0] ?? "").join("").toUpperCase();

type ProfileTab = "diem-danh" | "nhan-xet" | "bai-tap" | "hoc-ba";
const PROFILE_TABS: { key: ProfileTab; label: string; icon: LucideIcon }[] = [
  { key: "diem-danh", label: "Điểm danh", icon: CalendarCheck },
  { key: "nhan-xet", label: "Nhận xét", icon: ClipboardPen },
  { key: "bai-tap", label: "Bài tập & Kiểm tra", icon: NotebookPen },
  { key: "hoc-ba", label: "Học bạ", icon: ClipboardList },
];
function parseProfileTab(raw: string | undefined): ProfileTab {
  return PROFILE_TABS.find((t) => t.key === raw)?.key ?? "diem-danh";
}

export default async function TeacherStudentProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ s?: string; ptab?: string }>;
}) {
  const session = await auth();
  if (!session?.user) return null; // layout đã gate — guard cho type-narrow

  const { s: studentId, ptab } = await searchParams;
  const actor = await resolveActor(session.user.id);
  const sdb = scopedDb(actor);
  const classIds = [...actor.assignedClassIds];

  // ── (b) Hồ sơ 1 học viên (4 tab) ──────────────────────────────────────────────
  if (studentId) {
    // Đọc QUA quan hệ class (đã guard classId ∈ assignedClassIds) — enrollment dev
    // centerId=null bị scopedDb lọc mất nếu query sdb.enrollment trực tiếp (pattern
    // hub-students-tab / cham-bai). Giữ nguyên shape `enrollments` cho phần dưới.
    const profClasses = classIds.length
      ? await sdb.class.findMany({
          where: { id: { in: classIds } },
          select: {
            id: true,
            name: true,
            course: { select: { name: true } },
            enrollments: {
              where: { studentId, deletedAt: null },
              select: {
                id: true,
                courseId: true,
                status: true,
                // Câu 46: KHÔNG parent*/phone/email.
                student: {
                  select: {
                    id: true,
                    name: true,
                    studentCode: true,
                    avatarUrl: true,
                    dateOfBirth: true,
                    currentGrade: true,
                    school: true,
                  },
                },
              },
              orderBy: { createdAt: "desc" },
            },
          },
        })
      : [];
    const enrollments = profClasses.flatMap((c) =>
      c.enrollments.map((e) => ({
        id: e.id,
        classId: c.id,
        courseId: e.courseId,
        status: e.status,
        student: e.student,
        class: { name: c.name },
        course: { name: c.course.name },
      })),
    );
    if (enrollments.length === 0) return <NotYours />;

    const student = enrollments[0].student;
    const enrolledClassIds = [...new Set(enrollments.map((e) => e.classId))];
    const multiClass = enrolledClassIds.length > 1;
    const activeTab = parseProfileTab(ptab);
    const birthYear = student.dateOfBirth ? student.dateOfBirth.getUTCFullYear() : null;

    return (
      <div className="space-y-5">
        <BackLink href="?" label="Học viên lớp tôi" />

        {/* Định danh — avatar + tên + mã + năm sinh + lớp/khoá (KHÔNG contact PH) */}
        <div className="flex items-center gap-4">
          {student.avatarUrl ? (
            <img
              src={student.avatarUrl}
              alt={student.name}
              className="h-14 w-14 shrink-0 rounded-full border border-border object-cover"
            />
          ) : (
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-orange-100 text-lg font-semibold text-orange-700 dark:bg-orange-500/15 dark:text-orange-300">
              {initials(student.name)}
            </span>
          )}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold text-foreground">{student.name}</h1>
              <Badge variant="outline">{ENROLLMENT_STATUS.label(enrollments[0].status)}</Badge>
            </div>
            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
              <span>
                {student.studentCode ?? "—"}
                {birthYear ? ` · ${birthYear}` : ""}
              </span>
              {enrollments.map((e) => (
                <Link
                  key={e.id}
                  href={`/teacher/lop?classId=${e.classId}`}
                  className="font-medium text-orange-700 hover:text-orange-800 dark:text-orange-400"
                >
                  {e.class.name}
                </Link>
              ))}
              <span>{[...new Set(enrollments.map((e) => e.course.name))].join(" · ")}</span>
            </p>
          </div>
        </div>

        <ProfileTabBar studentId={studentId} active={activeTab} />

        {activeTab === "diem-danh" && (
          <AttendanceTab sdb={sdb} studentId={studentId} classIds={enrolledClassIds} multiClass={multiClass} />
        )}
        {activeTab === "nhan-xet" && (
          <ReviewsTab sdb={sdb} studentId={studentId} classIds={enrolledClassIds} multiClass={multiClass} />
        )}
        {activeTab === "bai-tap" && (
          <AssignmentsTab sdb={sdb} studentId={studentId} classIds={enrolledClassIds} />
        )}
        {activeTab === "hoc-ba" && (
          <HocBaTab
            sdb={sdb}
            enrollments={enrollments.map((e) => ({
              id: e.id,
              courseId: e.courseId,
              status: e.status,
              className: e.class.name,
              courseName: e.course.name,
            }))}
          />
        )}
      </div>
    );
  }

  // ── (a) Grid học viên các lớp mình (client search + lọc lớp) ───────────────────
  // Đọc QUA quan hệ class (enrollment dev centerId=null bị scopedDb lọc nếu query thẳng).
  const gridClasses = classIds.length
    ? await sdb.class.findMany({
        where: { id: { in: classIds } },
        select: {
          name: true,
          enrollments: {
            where: { deletedAt: null },
            // Câu 46: CHỈ tên + mã HV — KHÔNG contact PH.
            select: { status: true, student: { select: { id: true, name: true, studentCode: true } } },
            orderBy: { student: { name: "asc" } },
          },
        },
      })
    : [];
  const enrRows = gridClasses.flatMap((c) =>
    c.enrollments.map((e) => ({ status: e.status, student: e.student, className: c.name })),
  );

  // HV học 2 lớp mình → gộp 1 dòng, liệt kê các lớp (giữ trạng thái "cao nhất").
  const byStudent = new Map<string, StudentRow>();
  for (const r of enrRows) {
    const cur = byStudent.get(r.student.id) ?? {
      id: r.student.id,
      name: r.student.name,
      studentCode: r.student.studentCode,
      classes: [],
      status: r.status,
    };
    if (!cur.classes.includes(r.className)) cur.classes.push(r.className);
    if (ENROLLMENT_ACTIVE_STATUS_LIST.includes(r.status)) cur.status = r.status; // ưu tiên active
    byStudent.set(r.student.id, cur);
  }
  const rows = [...byStudent.values()];

  return (
    <div>
      <PageHeader
        title="Hồ sơ học viên"
        subtitle="Học viên các lớp bạn phụ trách — chọn học viên để xem chuyên cần, nhận xét, bài tập và học bạ."
      />
      {rows.length === 0 ? (
        <EmptyState
          icon={GraduationCap}
          title="Bạn chưa được phân công lớp nào hoặc lớp chưa có học viên."
        />
      ) : (
        <StudentList rows={rows} />
      )}
    </div>
  );
}

type Sdb = ReturnType<typeof scopedDb>;

/* ── Tab bar (server, searchParams) ─────────────────────────────────────────── */
function ProfileTabBar({ studentId, active }: { studentId: string; active: ProfileTab }) {
  return (
    <div className="overflow-x-auto">
      <nav className="flex min-w-max gap-1 border-b border-border" aria-label="Hồ sơ học viên">
        {PROFILE_TABS.map((t) => {
          const Icon = t.icon;
          const on = t.key === active;
          return (
            <Link
              key={t.key}
              href={`?s=${studentId}&ptab=${t.key}`}
              aria-current={on ? "page" : undefined}
              className={cn(
                "inline-flex shrink-0 items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                on
                  ? "border-orange-500 text-orange-700 dark:border-orange-400 dark:text-orange-300"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4" aria-hidden />
              {t.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

/* ── Tab Điểm danh: từng buổi + badge ───────────────────────────────────────── */
async function AttendanceTab({
  sdb,
  studentId,
  classIds,
  multiClass,
}: {
  sdb: Sdb;
  studentId: string;
  classIds: string[];
  multiClass: boolean;
}) {
  const sessions = await sdb.classSession.findMany({
    where: { classId: { in: classIds } },
    select: {
      id: true,
      date: true,
      topic: true,
      status: true,
      class: { select: { name: true } },
      attendances: { where: { studentId }, select: { status: true } },
    },
    orderBy: { date: "asc" },
  });
  if (sessions.length === 0) {
    return <EmptyState icon={CalendarCheck} title="Lớp chưa có buổi học nào." />;
  }
  return (
    <div className="t-card overflow-hidden">
      <ul className="divide-y divide-border">
        {sessions.map((s) => {
          const att = s.attendances[0]?.status as AttendanceStatus | undefined;
          return (
            <li key={s.id} className="flex items-center gap-4 px-5 py-3.5">
              <div className="w-24 shrink-0 text-sm font-semibold text-muted-foreground">
                {dayFmt.format(s.date)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-foreground">{s.topic ?? "Buổi học"}</p>
                {multiClass && <p className="truncate text-xs text-muted-foreground">{s.class.name}</p>}
              </div>
              {att ? (
                <span className={cn("inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold", ATT_BADGE[att].cls)}>
                  {ATT_BADGE[att].label}
                </span>
              ) : s.status === "CANCELLED" ? (
                <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground">
                  Đã huỷ
                </span>
              ) : (
                <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground">
                  Chưa diễn ra
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* ── Tab Nhận xét: phiếu từng buổi (Dự án + 4 mục + Xem phiếu) ───────────────── */
async function ReviewsTab({
  sdb,
  studentId,
  classIds,
  multiClass,
}: {
  sdb: Sdb;
  studentId: string;
  classIds: string[];
  multiClass: boolean;
}) {
  const feedbacks = await sdb.studentSessionFeedback.findMany({
    where: { studentId, classSession: { classId: { in: classIds } } },
    select: {
      id: true,
      projectName: true,
      notes: true,
      comment: true,
      rating: true,
      classSession: {
        select: { id: true, date: true, topic: true, class: { select: { name: true } } },
      },
    },
    orderBy: { createdAt: "desc" },
  });
  if (feedbacks.length === 0) {
    return (
      <EmptyState
        icon={ClipboardPen}
        title="Chưa có nhận xét"
        description="Các buổi đã dạy sẽ hiển thị nhận xét của giáo viên tại đây."
      />
    );
  }
  return (
    <div className="space-y-4">
      {feedbacks.map((f) => {
        const notes = normalizeEvalNotes(f.notes);
        const hasNotes =
          !!f.notes &&
          (notes.knowledge || notes.skill || notes.attitude || notes.proposal);
        return (
          <div key={f.id} className="t-card p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="font-semibold text-foreground">
                  {f.classSession.topic ?? "Buổi học"}
                </p>
                <p className="text-sm text-muted-foreground">
                  {dayFmt.format(f.classSession.date)}
                  {multiClass ? ` · ${f.classSession.class.name}` : ""}
                  {f.projectName ? ` · ${f.projectName}` : ""}
                </p>
              </div>
              <a
                href={`/teacher/nhan-xet/pdf/${f.classSession.id}/${studentId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm font-semibold text-orange-700 hover:text-orange-800 dark:text-orange-400"
              >
                Xem phiếu <FileDown className="h-4 w-4" aria-hidden />
              </a>
            </div>
            {hasNotes ? (
              <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <NoteItem label="Kiến thức" value={notes.knowledge} />
                <NoteItem label="Kỹ năng" value={notes.skill} />
                <NoteItem label="Thái độ" value={notes.attitude} />
                <NoteItem label="Đề xuất" value={notes.proposal} />
              </dl>
            ) : f.comment ? (
              <p className="whitespace-pre-wrap rounded-lg bg-muted/50 px-3.5 py-2.5 text-sm text-foreground">
                {f.comment}
              </p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function NoteItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-muted/50 px-3.5 py-2.5">
      <p className="text-xs font-bold uppercase tracking-wide text-orange-700 dark:text-orange-300">
        {label}
      </p>
      <p className="mt-0.5 text-sm text-foreground">{value || "—"}</p>
    </div>
  );
}

/* ── Tab Bài tập & Kiểm tra: bảng từng bài ──────────────────────────────────── */
async function AssignmentsTab({
  sdb,
  studentId,
  classIds,
}: {
  sdb: Sdb;
  studentId: string;
  classIds: string[];
}) {
  const subs = await sdb.assignmentSubmission.findMany({
    where: { studentId, assignment: { classId: { in: classIds } } },
    select: {
      status: true,
      score: true,
      assignment: {
        select: {
          title: true,
          dueAt: true,
          totalPoints: true,
          _count: { select: { questions: true } },
        },
      },
    },
    orderBy: { assignment: { assignedAt: "desc" } },
  });
  if (subs.length === 0) {
    return (
      <EmptyState
        icon={NotebookPen}
        title="Chưa có bài tập"
        description="Bài tập và bài kiểm tra được giao cho lớp sẽ hiển thị tại đây."
      />
    );
  }
  return (
    <div className="t-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              <th scope="col" className="px-5 py-3">Nội dung</th>
              <th scope="col" className="px-5 py-3">Hình thức</th>
              <th scope="col" className="px-5 py-3">Hạn nộp</th>
              <th scope="col" className="px-5 py-3">Tình trạng</th>
              <th scope="col" className="px-5 py-3">Điểm</th>
            </tr>
          </thead>
          <tbody>
            {subs.map((s, i) => {
              const isTest = s.assignment._count.questions > 0;
              const submitted = s.status !== "NOT_SUBMITTED";
              const due =
                s.assignment.dueAt && s.assignment.dueAt.getFullYear() >= 2000
                  ? dueFmt.format(s.assignment.dueAt)
                  : "—";
              return (
                <tr key={i} className="border-b border-border/60 transition-colors last:border-0 hover:bg-muted/50">
                  <td className="px-5 py-3.5 font-semibold text-foreground">{s.assignment.title}</td>
                  <td className="px-5 py-3.5">
                    <Badge
                      variant="outline"
                      className={
                        isTest
                          ? "border-orange-300 bg-orange-50 text-orange-700 dark:border-orange-500/40 dark:bg-orange-500/15 dark:text-orange-300"
                          : "border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-500/40 dark:bg-blue-500/15 dark:text-blue-300"
                      }
                    >
                      {isTest ? "Kiểm tra" : "Bài tập"}
                    </Badge>
                  </td>
                  <td className="px-5 py-3.5 whitespace-nowrap text-foreground">{due}</td>
                  <td className="px-5 py-3.5 whitespace-nowrap">
                    {submitted ? (
                      <span className="inline-flex items-center gap-1.5 font-medium text-emerald-700 dark:text-emerald-400">
                        <CircleCheck className="h-4 w-4" aria-hidden /> Đã nộp
                      </span>
                    ) : (
                      <span className="text-amber-600 dark:text-amber-400">Chưa nộp</span>
                    )}
                  </td>
                  <td className="px-5 py-3.5 whitespace-nowrap font-semibold text-foreground">
                    {s.score != null ? `${s.score}/${s.assignment.totalPoints}` : "—"}
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

/* ── Tab Học bạ: chuyên cần + năng lực + trạng thái duyệt + link mở học bạ ──── */
async function HocBaTab({
  sdb,
  enrollments,
}: {
  sdb: Sdb;
  enrollments: { id: string; courseId: string; status: string; className: string; courseName: string }[];
}) {
  const enrollmentIds = enrollments.map((e) => e.id);
  const [summaries, criteriaLists, cards] = await Promise.all([
    Promise.all(enrollments.map((e) => attendanceSummary(e.id))),
    Promise.all(enrollments.map((e) => getCourseCriteria(e.courseId))),
    sdb.reportCard.findMany({
      where: { enrollmentId: { in: enrollmentIds } },
      select: {
        enrollmentId: true,
        status: true,
        scores: { select: { criterionId: true, level: true } },
      },
    }),
  ]);
  const cardByEnrollment = new Map(cards.map((c) => [c.enrollmentId, c]));

  return (
    <div className="space-y-5">
      {enrollments.map((e, i) => {
        const sum = summaries[i];
        const criteria = criteriaLists[i];
        const card = cardByEnrollment.get(e.id);
        const levelByCriterion = new Map((card?.scores ?? []).map((sc) => [sc.criterionId, sc.level]));
        const rate = sum.total > 0 ? Math.round((sum.attended / sum.total) * 100) : null;
        const rs = card ? REPORT_STATUS[card.status] : null;
        return (
          <Card key={e.id}>
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="text-base">
                  {e.className} · {e.courseName}
                </CardTitle>
                <div className="flex items-center gap-2">
                  {rs && (
                    <span className={cn("inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold", rs.cls)}>
                      {rs.label}
                    </span>
                  )}
                  <Link
                    href={`/teacher/hoc-ba?enrollmentId=${e.id}`}
                    className="inline-flex items-center gap-1 rounded-sm text-sm font-semibold text-orange-600 outline-none hover:text-orange-700 focus-visible:ring-2 focus-visible:ring-ring dark:text-orange-400"
                  >
                    Mở học bạ <ChevronRight className="h-4 w-4" aria-hidden />
                  </Link>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              <section>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Chuyên cần</h3>
                <div className="grid grid-cols-3 gap-3">
                  <StatBox value={rate != null ? `${rate}%` : "—"} label="Tỉ lệ chuyên cần" tone="emerald" />
                  <StatBox value={sum.total > 0 ? `${sum.attended}/${sum.total}` : String(sum.attended)} label="Đã học (buổi)" tone="blue" />
                  <StatBox value={String(sum.absent + sum.needMakeup)} label="Vắng (buổi)" tone="red" />
                </div>
              </section>
              <section>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Năng lực (học bạ, thang 1-4)
                </h3>
                {criteria.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Khoá học chưa cấu hình tiêu chí năng lực.</p>
                ) : levelByCriterion.size === 0 ? (
                  <p className="text-sm text-muted-foreground">Học bạ chưa chấm tiêu chí nào — vào mục Học bạ để nhập.</p>
                ) : (
                  <div className="space-y-3">
                    {criteria.map((c) => (
                      <CompetencyBar key={c.id} label={c.name} level={levelByCriterion.get(c.id) ?? null} />
                    ))}
                  </div>
                )}
              </section>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

/* ── helpers dùng lại ───────────────────────────────────────────────────────── */
const STAT_TONE = {
  emerald: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  blue: "bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300",
  red: "bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300",
  amber: "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
} as const;

function StatBox({ value, label, tone }: { value: string; label: string; tone: keyof typeof STAT_TONE }) {
  return (
    <div className={`rounded-lg px-3 py-2.5 ${STAT_TONE[tone]}`}>
      <p className="text-lg font-bold">{value}</p>
      <p className="text-xs">{label}</p>
    </div>
  );
}

function CompetencyBar({ label, level }: { label: string; level: number | null }) {
  const pct = level != null ? Math.round((Math.min(4, Math.max(0, level)) / 4) * 100) : 0;
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2 text-sm">
        <span className="min-w-0 truncate font-medium text-foreground">{label}</span>
        <span className="shrink-0 text-xs font-semibold text-muted-foreground">
          {level != null ? (LEVEL_LABEL[level] ?? String(level)) : "Chưa chấm"}
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-orange-500" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function NotYours() {
  return (
    <div className="space-y-4">
      <BackLink href="?" label="Hồ sơ học viên" />
      <EmptyState icon={Lock} title="Học viên không thuộc lớp bạn phụ trách." />
    </div>
  );
}
