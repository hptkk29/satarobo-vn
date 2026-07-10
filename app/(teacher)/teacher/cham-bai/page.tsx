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
import { auth } from "@/lib/auth";
import { resolveActor } from "@/lib/auth/actor";
import { scopedDb } from "@/lib/db-scope";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
        <div className="space-y-4">
          <BackLink href="?" label="← Bài chờ chấm" />
          <EmptyBox text="Học viên chưa nộp bài — chưa thể chấm." />
        </div>
      );
    }

    return (
      <div className="space-y-4">
        <BackLink href="?" label="← Bài chờ chấm" />
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">
            Chấm bài — {sub.student.name}
          </h1>
          <p className="mt-1 text-sm text-neutral-500">
            {sub.assignment.title} · Lớp {sub.assignment.class.name}
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
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-neutral-900">Bài tập &amp; chấm điểm</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Bài học viên đã nộp, chờ bạn chấm — chọn bài để chấm nhanh hoặc chấm rubric.
        </p>
      </div>

      {rows.length === 0 ? (
        <EmptyBox
          text={
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
                  <Link key={r.id} href={`?submissionId=${r.id}`} className="block">
                    <div className="flex items-center justify-between gap-3 rounded-md border border-neutral-200 bg-white p-3 transition-colors hover:border-neutral-400">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-neutral-900">
                          {r.student.name}
                        </p>
                        <p className="mt-0.5 text-xs text-neutral-500">
                          {r.submittedAt
                            ? `Nộp: ${submitFmt.format(r.submittedAt)}`
                            : "Chưa rõ thời điểm nộp"}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {r.status === "LATE" && (
                          <Badge variant="outline" className="border-amber-400 text-amber-600">
                            Nộp muộn
                          </Badge>
                        )}
                        <span className="text-sm font-semibold text-purple-700">Chấm →</span>
                      </div>
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
    <Link href={href} className="text-sm text-neutral-500 hover:text-neutral-800">
      {label}
    </Link>
  );
}

function EmptyBox({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-neutral-300 bg-white p-10 text-center">
      <p className="text-sm text-neutral-500">{text}</p>
    </div>
  );
}

function NotYours() {
  return (
    <div className="space-y-4">
      <BackLink href="?" label="← Bài chờ chấm" />
      <EmptyBox text="Bài nộp không thuộc lớp bạn phụ trách." />
    </div>
  );
}
