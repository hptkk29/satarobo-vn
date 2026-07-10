// app/(teacher)/teacher/cham-bai/page.tsx — MÀN B: "Bài tập & chấm điểm".
//
// 2 mức điều hướng qua searchParams (pattern lop/page.tsx — không cần route động):
//   (a) không tham số   → list bài chờ chấm (SUBMITTED/LATE) group theo bài tập.
//   (b) ?submissionId=… → nội dung bài nộp + GradeForm (chấm nhanh | chấm rubric).
//
// Data: AssignmentSubmission KHÔNG ∈ SCOPED_MODELS (Loại B, không centerId) →
// cách ly qua assignment.classId ∈ actor.assignedClassIds (giống hệt khu
// "Bài chưa chấm" ở home). Action chấm TÁI DÙNG gradeSubmission /
// gradeSubmissionRubric của admin (gate bên trong: requireRole +
// classCenterVisible + canGradeClassWork — GV chỉ chấm lớp mình phụ trách).
// ⚠️ Câu 46: payload client CHỈ tên học viên — KHÔNG SĐT/email/tên PH.
import Link from "next/link";
import type { SubmissionStatus } from "@prisma/client";
import { ArrowLeft, Ban, ClipboardCheck, FileX2 } from "lucide-react";
import { auth } from "@/lib/auth";
import { resolveActor } from "@/lib/auth/actor";
import { scopedDb } from "@/lib/db-scope";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "../_components/ui/page-header";
import { EmptyState } from "../_components/ui/empty-state";
import { GradeForm } from "./_components/grade-form";

export const metadata = { title: "Chấm bài | Giáo viên Sata Robo" };

const submitFmt = new Intl.DateTimeFormat("vi-VN", {
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Ho_Chi_Minh",
});

export default async function TeacherGradingPage({
  searchParams,
}: {
  searchParams: Promise<{ submissionId?: string }>;
}) {
  const session = await auth();
  if (!session?.user) return null; // layout đã gate

  const { submissionId } = await searchParams;
  const actor = await resolveActor(session.user.id);
  const sdb = scopedDb(actor);
  const classIds = [...actor.assignedClassIds];

  // ── (b) Chấm 1 bài nộp ───────────────────────────────────────────────────────
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

    // Guard đọc TRƯỚC khi render: bài phải thuộc lớp mình được phân —
    // chống IDOR đổi submissionId trên URL (action đã tự gate lần nữa khi ghi).
    if (!sub || !actor.assignedClassIds.has(sub.assignment.classId)) {
      return <NotYours />;
    }

    if (sub.status === "NOT_SUBMITTED") {
      return (
        <div>
          <BackLink href="?" label="Bài chờ chấm" />
          <EmptyState icon={FileX2} title="Học viên chưa nộp bài — chưa thể chấm." />
        </div>
      );
    }

    return (
      <div>
        <BackLink href="?" label="Bài chờ chấm" />
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

  // ── (a) List bài chờ chấm, group theo bài tập ────────────────────────────────
  // Query giống hệt home #2 "Bài chưa chấm": SUBMITTED/LATE của lớp mình
  // (NOT_SUBMITTED/GRADED không tính — khớp computeAssignmentSummary).
  const rows =
    classIds.length === 0
      ? []
      : await sdb.assignmentSubmission.findMany({
          where: {
            status: { in: ["SUBMITTED", "LATE"] as SubmissionStatus[] },
            assignment: { classId: { in: classIds } },
          },
          select: {
            id: true,
            submittedAt: true,
            status: true,
            student: { select: { name: true } }, // câu 46: chỉ tên HV
            assignment: {
              select: {
                id: true,
                title: true,
                totalPoints: true,
                class: { select: { name: true } },
              },
            },
          },
          orderBy: { submittedAt: "asc" }, // nộp lâu nhất chấm trước
        });

  // Group theo assignment (giữ thứ tự submittedAt asc — bài có HV chờ lâu nhất lên đầu).
  type Row = (typeof rows)[number];
  const groups = new Map<
    string,
    { title: string; className: string; totalPoints: number; items: Row[] }
  >();
  for (const r of rows) {
    const g = groups.get(r.assignment.id);
    if (g) g.items.push(r);
    else
      groups.set(r.assignment.id, {
        title: r.assignment.title,
        className: r.assignment.class.name,
        totalPoints: r.assignment.totalPoints,
        items: [r],
      });
  }

  return (
    <div>
      <PageHeader
        title="Bài tập & chấm điểm"
        subtitle="Bài học viên đã nộp, chờ bạn chấm — chọn bài để chấm nhanh hoặc chấm rubric."
      />

      {rows.length === 0 ? (
        <EmptyState
          icon={ClipboardCheck}
          title={
            classIds.length === 0
              ? "Bạn chưa được phân công lớp nào."
              : "Không có bài chờ chấm."
          }
        />
      ) : (
        <div className="space-y-4">
          {[...groups.entries()].map(([assignmentId, g]) => (
            <Card key={assignmentId}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-base">{g.title}</CardTitle>
                  <Badge variant="destructive">{g.items.length} chờ chấm</Badge>
                </div>
                <CardDescription>
                  Lớp {g.className} · Thang điểm {g.totalPoints}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {g.items.map((r) => (
                  // href CHỈ-query (giữ path hiện tại): chạy đúng cả trên host
                  // giaovien (clean URL /cham-bai) LẪN localhost (/teacher/cham-bai).
                  <Link
                    key={r.id}
                    href={`?submissionId=${r.id}`}
                    className="flex items-center justify-between gap-3 rounded-md border border-border bg-card p-3 outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">
                        {r.student.name}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {r.submittedAt
                          ? `Nộp: ${submitFmt.format(r.submittedAt)}`
                          : "Chưa rõ thời điểm nộp"}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {r.status === "LATE" && (
                        <Badge
                          variant="outline"
                          className="border-amber-300 text-amber-700 dark:border-amber-500/40 dark:text-amber-300"
                        >
                          Nộp muộn
                        </Badge>
                      )}
                      <span className="text-sm font-semibold text-orange-600 dark:text-orange-400">
                        Chấm →
                      </span>
                    </div>
                  </Link>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="mb-4 inline-flex items-center gap-1.5 rounded-sm text-sm text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
    >
      <ArrowLeft className="h-4 w-4" aria-hidden />
      {label}
    </Link>
  );
}

function NotYours() {
  return (
    <div>
      <BackLink href="?" label="Bài chờ chấm" />
      <EmptyState icon={Ban} title="Bài nộp không thuộc lớp bạn phụ trách." />
    </div>
  );
}
