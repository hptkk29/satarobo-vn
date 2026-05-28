import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { AssignmentForm, type AssignmentFormValue } from "../../_components/assignment-form";
import { DocumentPicker } from "../../_components/document-picker";
import {
  SubmissionRow,
  type SubmissionRowData,
} from "../../_components/submission-row";

export const dynamic = "force-dynamic";

const ALLOWED_ROLES = ["SUPER_ADMIN", "CENTER_MANAGER", "TEACHER"];

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EditAssignmentPage({ params }: Props) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!ALLOWED_ROLES.includes(session.user.role)) {
    redirect("/dashboard?error=unauthorized");
  }

  const { id } = await params;

  const [assignment, classes, lessons, documentBank] = await Promise.all([
    db.assignment.findUnique({
      where: { id },
      include: {
        documents: {
          include: {
            document: {
              select: {
                id: true,
                title: true,
                fileName: true,
                fileSize: true,
                fileUrl: true,
                type: true,
              },
            },
          },
          orderBy: { createdAt: "asc" },
        },
        submissions: {
          include: {
            student: {
              select: {
                name: true,
                studentCode: true,
                parentPhone: true,
                phone: true,
              },
            },
            gradedBy: { select: { fullName: true } },
          },
          orderBy: [{ status: "asc" }, { createdAt: "asc" }],
        },
      },
    }),
    db.class.findMany({
      where: { deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true, classCode: true },
      take: 200,
    }),
    db.lesson.findMany({
      where: { curriculum: { isActive: true } },
      include: { curriculum: { select: { name: true } } },
      orderBy: [{ curriculumId: "asc" }, { order: "asc" }],
      take: 500,
    }),
    db.document.findMany({
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        title: true,
        fileName: true,
        fileSize: true,
        fileUrl: true,
        type: true,
      },
      take: 500,
    }),
  ]);

  if (!assignment) notFound();

  const formValue: AssignmentFormValue = {
    id: assignment.id,
    title: assignment.title,
    description: assignment.description,
    instructions: assignment.instructions,
    classId: assignment.classId,
    lessonId: assignment.lessonId,
    totalPoints: assignment.totalPoints,
    dueAt: assignment.dueAt,
    allowText: assignment.allowText,
    allowFile: assignment.allowFile,
    status: assignment.status,
  };

  const attached = assignment.documents.map((ad) => ({
    id: ad.id,
    documentId: ad.documentId,
    title: ad.document.title,
    fileName: ad.document.fileName,
    fileSize: ad.document.fileSize,
    fileUrl: ad.document.fileUrl,
    type: ad.document.type,
  }));

  const submissions: SubmissionRowData[] = assignment.submissions.map((s) => ({
    id: s.id,
    status: s.status,
    textAnswer: s.textAnswer,
    fileUrl: s.fileUrl,
    fileName: s.fileName,
    fileSize: s.fileSize,
    mimeType: s.mimeType,
    submittedAt: s.submittedAt,
    score: s.score,
    feedback: s.feedback,
    gradedAt: s.gradedAt,
    studentName: s.student.name,
    studentCode: s.student.studentCode,
    studentParentPhone: s.student.parentPhone ?? s.student.phone,
    totalPoints: assignment.totalPoints,
    gradedByName: s.gradedBy?.fullName ?? null,
  }));

  const submittedTotal = submissions.filter(
    (s) => s.status === "SUBMITTED" || s.status === "LATE" || s.status === "GRADED",
  ).length;
  const gradedTotal = submissions.filter((s) => s.status === "GRADED").length;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/assignments"
          className="mb-3 inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-700"
        >
          <ChevronLeft className="h-4 w-4" /> Quay lại danh sách
        </Link>
        <h1 className="text-2xl font-bold text-neutral-900">
          Sửa bài tập:{" "}
          <span className="font-bold text-orange-600">{assignment.title}</span>
        </h1>
      </div>

      <AssignmentForm
        assignment={formValue}
        classes={classes}
        lessons={lessons.map((l) => ({
          id: l.id,
          order: l.order,
          title: l.title,
          curriculumName: l.curriculum.name,
        }))}
      />

      <DocumentPicker
        assignmentId={assignment.id}
        documentBank={documentBank}
        initialAttached={attached}
      />

      {assignment.status !== "DRAFT" && (
        <section className="rounded-xl border border-neutral-200 bg-white">
          <header className="border-b border-neutral-100 p-4">
            <h2 className="text-sm font-bold uppercase tracking-wider text-neutral-700">
              Bài nộp của học viên ({submissions.length})
            </h2>
            <p className="mt-0.5 text-xs text-neutral-500">
              {submittedTotal > 0
                ? `Đã nộp ${submittedTotal}/${submissions.length} · Đã chấm ${gradedTotal}`
                : "Chưa có HS nào nộp bài."}
            </p>
          </header>
          {submissions.length === 0 ? (
            <div className="p-6 text-center text-sm text-neutral-400">
              Chưa có bản nộp bài nào. Cần publish trước để hệ thống tự tạo
              bản nộp rỗng cho HS đang học.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-neutral-100">
                <thead className="bg-neutral-50">
                  <tr>
                    <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-neutral-500">
                      Học viên
                    </th>
                    <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-neutral-500">
                      Trạng thái
                    </th>
                    <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-neutral-500">
                      Nộp lúc
                    </th>
                    <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-neutral-500">
                      Nội dung
                    </th>
                    <th className="px-3 py-3 text-right text-xs font-semibold uppercase tracking-wider text-neutral-500">
                      Điểm
                    </th>
                    <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-neutral-500">
                      Nhận xét
                    </th>
                    <th className="px-3 py-3 text-right text-xs font-semibold uppercase tracking-wider text-neutral-500">
                      Hành động
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-50">
                  {submissions.map((s) => (
                    <SubmissionRow key={s.id} row={s} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {assignment.status === "DRAFT" && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <strong>DRAFT:</strong> Hệ thống chưa tạo bản nộp bài cho HS.
          Bấm <strong>Publish</strong> ở trên để mở cho lớp.
        </div>
      )}
    </div>
  );
}
