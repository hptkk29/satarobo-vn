// app/(teacher)/teacher/cham-bai/page.tsx — "Bài tập & kiểm tra" (route giữ /cham-bai).
//
// 3 mức điều hướng qua searchParams (pattern lop/page.tsx — không cần route động):
//   (a) không tham số     → BẢNG bài tập đã giao ở lớp mình (7 cột như reference).
//   (b) ?assignmentId=…   → chi tiết 1 bài: roster + tình trạng nộp + link chấm.
//   (c) ?submissionId=…   → nội dung bài nộp + GradeForm (chấm nhanh | chấm rubric).
//
// Data: Assignment (Loại B, không centerId) → cách ly qua classId ∈ assignedClassIds.
// AssignmentSubmission tương tự (guard theo assignment.classId). Action chấm TÁI DÙNG
// gradeSubmission/gradeSubmissionRubric của admin (gate bên trong: requireRole +
// classCenterVisible + canGradeClassWork — GV chỉ chấm lớp mình phụ trách).
// ⚠️ Câu 46: payload client CHỈ tên học viên — KHÔNG SĐT/email/tên PH.
import Link from "next/link";
import type { SubmissionStatus } from "@prisma/client";
import { Ban, ClipboardCheck, FileX2, Plus } from "lucide-react";
import { auth } from "@/lib/auth";
import { resolveActor } from "@/lib/auth/actor";
import { scopedDb } from "@/lib/db-scope";
import { ENROLLMENT_ACTIVE_STATUS_LIST } from "@/lib/enrollment-status";
import { Button } from "@/components/ui/button";
import { PageHeader } from "../_components/ui/page-header";
import { EmptyState } from "../_components/ui/empty-state";
import { GradeForm } from "./_components/grade-form";
import { AssignmentList, type AssignmentRow } from "./_components/assignment-list";
import { AssignForm } from "./_components/assign-form";
import { BatchGrade } from "./_components/batch-grade";
import { resolveTemplateOwnerId } from "../kho-bai-tap/_owner";
import { BackLink } from "../_components/ui/back-link";

export const metadata = { title: "Bài tập & kiểm tra | Giáo viên Sata Robo" };

/** Trạng thái nộp được tính là "đã nộp" (khớp computeAssignmentSummary phía home). */
const SUBMITTED_STATUSES: SubmissionStatus[] = ["SUBMITTED", "LATE", "GRADED"];

const submitFmt = new Intl.DateTimeFormat("vi-VN", {
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Ho_Chi_Minh",
});
/** "YYYY-MM-DD" (giờ VN) cho cột Hạn nộp. */
const dueFmt = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: "Asia/Ho_Chi_Minh",
});

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

export default async function TeacherAssignmentsPage({
  searchParams,
}: {
  searchParams: Promise<{
    assignmentId?: string;
    submissionId?: string;
    compose?: string;
    lockClassId?: string;
    back?: string;
  }>;
}) {
  const session = await auth();
  if (!session?.user) return null; // layout đã gate

  const { assignmentId, submissionId, compose, lockClassId, back } = await searchParams;
  const actor = await resolveActor(session.user.id);
  const sdb = scopedDb(actor);
  const classIds = [...actor.assignedClassIds];

  // ── (c) Chấm 1 bài nộp ───────────────────────────────────────────────────────
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
        student: { select: { name: true } }, // câu 46: CHỈ tên HV, KHÔNG contact PH
        assignment: {
          select: {
            id: true,
            title: true,
            totalPoints: true,
            classId: true,
            class: { select: { name: true } },
          },
        },
      },
    });

    // Guard đọc TRƯỚC khi render: bài phải thuộc lớp mình được phân — chống IDOR
    // đổi submissionId trên URL (action đã tự gate lần nữa khi ghi).
    if (!sub || !actor.assignedClassIds.has(sub.assignment.classId)) {
      return <NotYours />;
    }

    if (sub.status === "NOT_SUBMITTED") {
      return (
        <div>
          <BackLink className="mb-4" href={`?assignmentId=${sub.assignment.id}`} label="Chi tiết bài tập" />
          <EmptyState icon={FileX2} title="Học viên chưa nộp bài — chưa thể chấm." />
        </div>
      );
    }

    return (
      <div>
        <BackLink className="mb-4" href={`?assignmentId=${sub.assignment.id}`} label="Chi tiết bài tập" />
        <PageHeader
          title={`Chấm bài — ${sub.student.name}`}
          subtitle={`${sub.assignment.title} · Lớp ${sub.assignment.class.name}`}
        />
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
        />
      </div>
    );
  }

  // ── (b) Chi tiết 1 bài: roster + tình trạng nộp ──────────────────────────────
  if (assignmentId) {
    // Roster đọc QUA quan hệ class (đã guard assignedClassIds) thay vì query
    // Enrollment trực tiếp: enrollment dev có centerId=null → scopedDb lọc mất khi
    // truy vấn thẳng; đọc qua class (đã thuộc actor) khớp cách _count đếm ở mức (a).
    const asg = await sdb.assignment.findUnique({
      where: { id: assignmentId },
      select: {
        id: true,
        title: true,
        classId: true,
        totalPoints: true,
        kind: true, // CLASSWORK/HOMEWORK — cùng _count.questions xác định isTest
        class: {
          select: {
            name: true,
            enrollments: {
              where: { status: { in: ENROLLMENT_ACTIVE_STATUS_LIST } },
              select: { student: { select: { id: true, name: true } } }, // câu 46: chỉ tên HV
              orderBy: { student: { name: "asc" } },
            },
          },
        },
        submissions: {
          select: {
            id: true,
            studentId: true,
            status: true,
            score: true,
          },
        },
        _count: { select: { questions: true } }, // >0 → hình thức "Kiểm tra"
      },
    });
    if (!asg || !actor.assignedClassIds.has(asg.classId)) return <NotYours />;

    // Roster active của lớp + ghép bài nộp (HV chưa nộp vẫn hiện "Chưa nộp").
    const roster = asg.class.enrollments;
    const subByStudent = new Map(asg.submissions.map((s) => [s.studentId, s]));
    const submittedCount = asg.submissions.filter((s) =>
      SUBMITTED_STATUSES.includes(s.status),
    ).length;

    // Bài "Kiểm tra" (có câu hỏi online HOẶC bài trên lớp CLASSWORK) → cho chấm cả lớp
    // (HV kiểm tra offline không nộp online). Bài tập về nhà (HOMEWORK) chấm theo bài nộp.
    const isTest = asg._count.questions > 0 || asg.kind === "CLASSWORK";
    const batchRoster = roster.map((e) => ({
      studentId: e.student.id,
      name: e.student.name, // câu 46: chỉ tên HV
      score: subByStudent.get(e.student.id)?.score ?? null,
    }));

    return (
      <div>
        <BackLink className="mb-4" href="?" label="Bài tập & kiểm tra" />
        <PageHeader
          title={asg.title}
          subtitle={`Lớp ${asg.class.name} · Thang điểm ${asg.totalPoints} · Đã nộp ${submittedCount}/${roster.length}`}
          actions={
            isTest ? (
              <BatchGrade
                assignmentId={asg.id}
                totalPoints={asg.totalPoints}
                roster={batchRoster}
              />
            ) : undefined
          }
        />
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
                            href={`?submissionId=${sub.id}`}
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

  // ── (d) Giao bài — FULL PAGE (thay popup) ────────────────────────────────────
  // Vào từ nút "Giao bài" (?compose=giao) hoặc từ Class Hub (?compose=giao&lockClassId
  // &back=<hub url>). lockClassId khoá 1 lớp; back = nơi quay về sau khi giao/huỷ.
  if (compose === "giao") {
    const backHref = back && back.startsWith("/teacher/") ? back : "/teacher/cham-bai";
    if (classIds.length === 0) {
      return (
        <div>
          <BackLink className="mb-4" href={backHref} label="Bài tập & kiểm tra" />
          <EmptyState icon={ClipboardCheck} title="Bạn chưa được phân công lớp nào." />
        </div>
      );
    }

    // Lớp có thể giao: khoá 1 lớp nếu lockClassId hợp lệ (từ Class Hub), else tất cả.
    const lockOne = lockClassId && actor.assignedClassIds.has(lockClassId) ? lockClassId : null;
    const [composeClasses, composeTemplates, composeOwner] = await Promise.all([
      sdb.class.findMany({
        where: { id: { in: lockOne ? [lockOne] : classIds } },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
      sdb.assignmentTemplate.findMany({
        select: {
          id: true,
          title: true,
          createdById: true,
          _count: { select: { templateQuestions: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 200,
      }),
      resolveTemplateOwnerId(sdb, session.user.id),
    ]);
    const composeOwnerId = composeOwner.ownerId;

    // selfHref: URL trang giao hiện tại — để "Tạo bài tập mới" quay lại đúng chỗ.
    const selfParams = new URLSearchParams({ compose: "giao" });
    if (lockOne) selfParams.set("lockClassId", lockOne);
    if (back) selfParams.set("back", back);
    const selfHref = `/teacher/cham-bai?${selfParams.toString()}`;

    return (
      <div>
        <BackLink className="mb-4" href={backHref} label="Bài tập & kiểm tra" />
        <PageHeader
          title="Giao bài cho lớp"
          subtitle="Chọn nguồn đầu bài, lớp bạn phụ trách và hạn nộp. Bài giao xong sẽ mở ngay cho học viên."
        />
        <AssignForm
          classes={composeClasses}
          templates={composeTemplates.map((t) => ({
            id: t.id,
            title: t.title,
            isTest: t._count.templateQuestions > 0,
            isMine: t.createdById === composeOwnerId,
          }))}
          back={backHref}
          selfHref={selfHref}
        />
      </div>
    );
  }

  // ── (a) Bảng bài tập đã giao ─────────────────────────────────────────────────
  const assignments = classIds.length
    ? await sdb.assignment.findMany({
        where: { classId: { in: classIds }, status: { in: ["PUBLISHED", "CLOSED"] } },
        select: {
          id: true,
          title: true,
          classId: true,
          status: true,
          dueAt: true,
          templateId: true,
          class: { select: { name: true } },
          _count: {
            select: {
              questions: true, // >0 → hình thức "Kiểm tra"
              submissions: { where: { status: { in: SUBMITTED_STATUSES } } },
            },
          },
        },
        orderBy: { assignedAt: "desc" },
      })
    : [];

  // Sĩ số (mẫu số cột "Đã nộp") = số HV đang học của lớp. + tên lớp cho dialog Giao bài.
  const classCounts = classIds.length
    ? await sdb.class.findMany({
        where: { id: { in: classIds } },
        select: {
          id: true,
          name: true,
          _count: {
            select: {
              enrollments: { where: { status: { in: ENROLLMENT_ACTIVE_STATUS_LIST } } },
            },
          },
        },
        orderBy: { name: "asc" },
      })
    : [];
  const enrollBy = new Map(classCounts.map((c) => [c.id, c._count.enrollments]));

  const rows: AssignmentRow[] = assignments.map((a) => ({
    id: a.id,
    title: a.title,
    classId: a.classId,
    className: a.class.name,
    isTest: a._count.questions > 0,
    fromAdmin: a.templateId != null,
    // Guard năm < 2000: một số bài seed để dueAt = epoch (1970) → coi như không có hạn.
    due: a.dueAt && a.dueAt.getFullYear() >= 2000 ? dueFmt.format(a.dueAt) : null,
    submitted: a._count.submissions,
    total: enrollBy.get(a.classId) ?? 0,
    status: a.status,
  }));

  return (
    <div>
      <PageHeader
        title="Bài tập & kiểm tra"
        subtitle="Bài đã giao ở các lớp bạn phụ trách. Đầu bài lấy từ thư viện admin."
        actions={
          classIds.length > 0 ? (
            <Button asChild className="shrink-0">
              <Link href="?compose=giao">
                <Plus className="mr-1.5 h-4 w-4" aria-hidden /> Giao bài
              </Link>
            </Button>
          ) : undefined
        }
      />
      {classIds.length === 0 ? (
        <EmptyState icon={ClipboardCheck} title="Bạn chưa được phân công lớp nào." />
      ) : (
        <AssignmentList rows={rows} />
      )}
    </div>
  );
}

function NotYours() {
  return (
    <div>
      <BackLink className="mb-4" href="?" label="Bài tập & kiểm tra" />
      <EmptyState icon={Ban} title="Bài tập không thuộc lớp bạn phụ trách." />
    </div>
  );
}
