// hub-assignments-tab.tsx — Tab "Bài tập & Kiểm tra" của Class Hub (3 mức inline).
//
//   · List:  bài đã giao ở lớp (7 cột) + nút "Giao bài" (AssignDialog khoá 1 lớp).
//   · Detail (?asgId=): roster + tình trạng nộp + điểm; bài đã nộp → "Chấm".
//   · Grade  (?asgId=&subId=): GradeForm (chấm nhanh 0..thang | rubric 6 tiêu chí),
//     TÁI DÙNG gradeSubmission/gradeSubmissionRubric (gate quyền trong action). Chấm
//     xong quay về roster (backHref) để chấm HV kế.
//
// Assignment (Loại B, không centerId) → cách ly qua classId ∈ assignedClassIds
// (guard ở caller + kiểm lại sub.assignment.classId===classId chống IDOR).
// ⚠️ Câu 46: payload client CHỈ tên học viên — KHÔNG SĐT/email/tên PH.
import Link from "next/link";
import { ArrowLeft, Ban, Eye, FileX2, Library, PencilLine } from "lucide-react";
import type { SubmissionStatus } from "@prisma/client";
import type { Actor } from "@/lib/auth/actor";
import { scopedDb } from "@/lib/db-scope";
import { ENROLLMENT_ACTIVE_STATUS_LIST } from "@/lib/enrollment-status";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "../../_components/ui/empty-state";
import { AssignDialog } from "../../cham-bai/_components/assign-dialog";
import { GradeForm } from "../../cham-bai/_components/grade-form";

const SUBMITTED_STATUSES: SubmissionStatus[] = ["SUBMITTED", "LATE", "GRADED"];

const ASSIGNMENT_STATUS_LABEL: Record<string, string> = {
  PUBLISHED: "Đang mở",
  CLOSED: "Đã đóng",
  DRAFT: "Nháp",
};

const SUB_STATUS: Record<SubmissionStatus, { label: string; cls: string }> = {
  NOT_SUBMITTED: { label: "Chưa nộp", cls: "bg-muted text-muted-foreground" },
  SUBMITTED: {
    label: "Đã nộp",
    cls: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  },
  LATE: {
    label: "Nộp muộn",
    cls: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  },
  GRADED: {
    label: "Đã chấm",
    cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-600/20 dark:text-emerald-200",
  },
};

/** "YYYY-MM-DD" (giờ VN) cho cột Hạn nộp. */
const dueFmt = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: "Asia/Ho_Chi_Minh",
});
const submitFmt = new Intl.DateTimeFormat("vi-VN", {
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Ho_Chi_Minh",
});

function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="mb-4 inline-flex items-center gap-1.5 rounded-sm text-sm text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
    >
      <ArrowLeft className="h-4 w-4" aria-hidden /> {label}
    </Link>
  );
}

export async function HubAssignmentsTab({
  actor,
  classId,
  className,
  assignmentId,
  submissionId,
}: {
  actor: Actor;
  classId: string;
  className: string;
  assignmentId?: string;
  submissionId?: string;
}) {
  const sdb = scopedDb(actor);

  // ── Grade: chấm 1 bài nộp ────────────────────────────────────────────────────
  if (submissionId) {
    const sub = await sdb.assignmentSubmission.findUnique({
      where: { id: submissionId },
      select: {
        id: true,
        status: true,
        submittedAt: true,
        textAnswer: true,
        fileUrl: true,
        fileName: true,
        fileSize: true,
        score: true,
        feedback: true,
        student: { select: { name: true } }, // câu 46: CHỈ tên HV
        assignment: {
          select: { id: true, title: true, totalPoints: true, classId: true },
        },
      },
    });
    // Guard đọc: bài phải thuộc ĐÚNG lớp đang mở (chống IDOR đổi subId trên URL).
    if (!sub || sub.assignment.classId !== classId) {
      return (
        <div>
          <BackLink href={`?classId=${classId}&tab=bai-tap`} label="Bài tập & Kiểm tra" />
          <EmptyState icon={Ban} title="Bài nộp không thuộc lớp bạn phụ trách." />
        </div>
      );
    }
    const backToDetail = `?classId=${classId}&tab=bai-tap&asgId=${sub.assignment.id}`;
    if (sub.status === "NOT_SUBMITTED") {
      return (
        <div>
          <BackLink href={backToDetail} label="Chi tiết bài tập" />
          <EmptyState icon={FileX2} title="Học viên chưa nộp bài — chưa thể chấm." />
        </div>
      );
    }
    return (
      <div>
        <BackLink href={backToDetail} label="Chi tiết bài tập" />
        <div className="mb-4">
          <h2 className="text-lg font-bold text-foreground">Chấm bài — {sub.student.name}</h2>
          <p className="text-sm text-muted-foreground">
            {sub.assignment.title} · Lớp {className}
          </p>
        </div>
        <GradeForm
          submissionId={sub.id}
          studentName={sub.student.name}
          totalPoints={sub.assignment.totalPoints}
          submittedAtText={sub.submittedAt ? submitFmt.format(sub.submittedAt) : null}
          isLate={sub.status === "LATE"}
          graded={sub.status === "GRADED"}
          textAnswer={sub.textAnswer}
          fileUrl={sub.fileUrl}
          fileName={sub.fileName}
          fileSize={sub.fileSize}
          initialScore={sub.score}
          initialFeedback={sub.feedback}
          backHref={backToDetail}
        />
      </div>
    );
  }

  // ── Detail: roster + tình trạng nộp ──────────────────────────────────────────
  if (assignmentId) {
    // Roster đọc QUA quan hệ class (đã guard) — enrollment dev centerId=null bị
    // scopedDb lọc nếu query thẳng (pattern cham-bai).
    const asg = await sdb.assignment.findUnique({
      where: { id: assignmentId },
      select: {
        id: true,
        title: true,
        classId: true,
        totalPoints: true,
        class: {
          select: {
            enrollments: {
              where: { status: { in: ENROLLMENT_ACTIVE_STATUS_LIST } },
              select: { student: { select: { id: true, name: true } } }, // câu 46: chỉ tên
              orderBy: { student: { name: "asc" } },
            },
          },
        },
        submissions: { select: { id: true, studentId: true, status: true, score: true } },
      },
    });
    if (!asg || asg.classId !== classId) {
      return (
        <div>
          <BackLink href={`?classId=${classId}&tab=bai-tap`} label="Bài tập & Kiểm tra" />
          <EmptyState icon={Ban} title="Bài tập không thuộc lớp bạn phụ trách." />
        </div>
      );
    }
    const roster = asg.class.enrollments;
    const subByStudent = new Map(asg.submissions.map((s) => [s.studentId, s]));
    const submittedCount = asg.submissions.filter((s) =>
      SUBMITTED_STATUSES.includes(s.status),
    ).length;

    return (
      <div>
        <BackLink href={`?classId=${classId}&tab=bai-tap`} label="Bài tập & Kiểm tra" />
        <div className="mb-4">
          <h2 className="text-lg font-bold text-foreground">{asg.title}</h2>
          <p className="text-sm text-muted-foreground">
            Thang điểm {asg.totalPoints} · Đã nộp {submittedCount}/{roster.length}
          </p>
        </div>
        <div className="t-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  <th scope="col" className="px-5 py-3">Học viên</th>
                  <th scope="col" className="px-5 py-3">Tình trạng</th>
                  <th scope="col" className="px-5 py-3">Điểm</th>
                  <th scope="col" className="px-5 py-3 text-right">
                    <span className="sr-only">Chấm</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {roster.map((e) => {
                  const sub = subByStudent.get(e.student.id);
                  const st = SUB_STATUS[sub?.status ?? "NOT_SUBMITTED"];
                  const canGrade = sub != null && SUBMITTED_STATUSES.includes(sub.status);
                  return (
                    <tr
                      key={e.student.id}
                      className="border-b border-border/60 transition-colors last:border-0 hover:bg-muted/50"
                    >
                      <td className="px-5 py-3.5 font-medium text-foreground">{e.student.name}</td>
                      <td className="px-5 py-3.5 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${st.cls}`}
                        >
                          {st.label}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 whitespace-nowrap text-foreground">
                        {sub?.score != null ? `${sub.score}/${asg.totalPoints}` : "—"}
                      </td>
                      <td className="px-5 py-3.5 text-right whitespace-nowrap">
                        {canGrade && sub ? (
                          <Link
                            href={`?classId=${classId}&tab=bai-tap&asgId=${asg.id}&subId=${sub.id}`}
                            className="rounded-sm text-sm font-semibold text-orange-600 outline-none hover:text-orange-700 focus-visible:ring-2 focus-visible:ring-ring dark:text-orange-400"
                          >
                            {sub.status === "GRADED" ? "Xem / sửa" : "Chấm"} →
                          </Link>
                        ) : (
                          <span className="text-sm text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  // ── List: bài đã giao ở lớp + Giao bài ───────────────────────────────────────
  const [assignments, cls, templates] = await Promise.all([
    sdb.assignment.findMany({
      where: { classId, status: { in: ["PUBLISHED", "CLOSED"] } },
      select: {
        id: true,
        title: true,
        status: true,
        dueAt: true,
        templateId: true,
        _count: {
          select: {
            questions: true, // >0 → hình thức "Kiểm tra"
            submissions: { where: { status: { in: SUBMITTED_STATUSES } } },
          },
        },
      },
      orderBy: { assignedAt: "desc" },
    }),
    sdb.class.findUnique({
      where: { id: classId },
      select: {
        _count: {
          select: {
            enrollments: { where: { status: { in: ENROLLMENT_ACTIVE_STATUS_LIST } } },
          },
        },
      },
    }),
    sdb.assignmentTemplate.findMany({
      select: { id: true, title: true, _count: { select: { templateQuestions: true } } },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
  ]);
  const rosterCount = cls?._count.enrollments ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Bài tập &amp; kiểm tra đã giao cho lớp. Đầu bài lấy từ thư viện Đào tạo.
        </p>
        <AssignDialog
          classes={[{ id: classId, name: className }]}
          templates={templates.map((t) => ({
            id: t.id,
            title: t.title,
            isTest: t._count.templateQuestions > 0,
          }))}
        />
      </div>

      <div className="t-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                <th scope="col" className="px-5 py-3">Nội dung</th>
                <th scope="col" className="px-5 py-3">Hình thức</th>
                <th scope="col" className="px-5 py-3">Nguồn</th>
                <th scope="col" className="px-5 py-3">Hạn nộp</th>
                <th scope="col" className="px-5 py-3">Đã nộp</th>
                <th scope="col" className="px-5 py-3">Trạng thái</th>
                <th scope="col" className="px-5 py-3 text-right">
                  <span className="sr-only">Chi tiết</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {assignments.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-10 text-center text-sm text-muted-foreground">
                    Chưa giao bài nào cho lớp — bấm “Giao bài” để chọn đầu bài từ thư viện.
                  </td>
                </tr>
              ) : (
                assignments.map((a) => {
                  const isTest = a._count.questions > 0;
                  const fromAdmin = a.templateId != null;
                  const due =
                    a.dueAt && a.dueAt.getFullYear() >= 2000 ? dueFmt.format(a.dueAt) : "—";
                  return (
                    <tr
                      key={a.id}
                      className="border-b border-border/60 transition-colors last:border-0 hover:bg-muted/50"
                    >
                      <td className="px-5 py-3.5 font-semibold text-foreground">{a.title}</td>
                      <td className="px-5 py-3.5">
                        {isTest ? (
                          <Badge
                            variant="outline"
                            className="border-orange-300 bg-orange-50 text-orange-700 dark:border-orange-500/40 dark:bg-orange-500/15 dark:text-orange-300"
                          >
                            Kiểm tra
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-500/40 dark:bg-blue-500/15 dark:text-blue-300"
                          >
                            Bài tập
                          </Badge>
                        )}
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                          {fromAdmin ? (
                            <>
                              <Library className="h-3.5 w-3.5" aria-hidden /> Đào tạo
                            </>
                          ) : (
                            <>
                              <PencilLine className="h-3.5 w-3.5" aria-hidden /> Tự tạo
                            </>
                          )}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 whitespace-nowrap text-foreground">{due}</td>
                      <td className="px-5 py-3.5 whitespace-nowrap font-semibold text-foreground">
                        {a._count.submissions}/{rosterCount}
                      </td>
                      <td className="px-5 py-3.5 whitespace-nowrap">
                        <Badge variant="outline">
                          {ASSIGNMENT_STATUS_LABEL[a.status] ?? a.status}
                        </Badge>
                      </td>
                      <td className="px-5 py-3.5 text-right whitespace-nowrap">
                        <Link
                          href={`?classId=${classId}&tab=bai-tap&asgId=${a.id}`}
                          className="inline-flex items-center gap-1 rounded-sm text-sm font-semibold text-orange-600 outline-none hover:text-orange-700 focus-visible:ring-2 focus-visible:ring-ring dark:text-orange-400"
                        >
                          <Eye className="h-4 w-4" aria-hidden />
                          {isTest ? "Chấm điểm" : "Chi tiết"}
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
