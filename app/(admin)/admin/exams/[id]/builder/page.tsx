import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { scopedDb } from "@/lib/db-scope";
import { resolveActor } from "@/lib/auth/actor";
import {
  ExamBuilder,
  type QuestionBankItem,
  type SelectedExamQuestion,
} from "../../_components/exam-builder";
import { ExamForm, type ExamFormValue } from "../../_components/exam-form";
import { can } from "@/lib/auth/permissions";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ExamBuilderPage({ params }: Props) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!can(session.user, "exams:edit")) {
    redirect("/dashboard?error=unauthorized");
  }

  const { id } = await params;

  // Cách ly cơ sở: dropdown chọn lớp cho đề thi PHẢI giới hạn theo tầm nhìn cơ sở
  // của actor (Class ∈ SCOPED_MODELS) — CS1 không thấy lớp CS2. Exam/Lesson/Question
  // không phải model center-isolated (đề/curriculum/ngân hàng câu hỏi dùng chung).
  const actor = await resolveActor(session.user.id);
  const sdb = scopedDb(actor);

  const [exam, classes, lessons, bank] = await Promise.all([
    db.exam.findUnique({
      where: { id },
      include: {
        examQuestions: {
          orderBy: { order: "asc" },
          include: {
            question: {
              select: { id: true, type: true, text: true, difficulty: true },
            },
          },
        },
      },
    }),
    sdb.class.findMany({
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
    db.question.findMany({
      where: { isPublic: true },
      orderBy: { updatedAt: "desc" },
      include: {
        lesson: { select: { title: true, order: true } },
      },
      take: 500,
    }),
  ]);

  if (!exam) notFound();

  const examFormValue: ExamFormValue = {
    id: exam.id,
    examCode: exam.examCode,
    title: exam.title,
    description: exam.description,
    classId: exam.classId,
    lessonId: exam.lessonId,
    durationMinutes: exam.durationMinutes,
    totalPoints: exam.totalPoints,
    passingScore: exam.passingScore,
    shuffleQuestions: exam.shuffleQuestions,
    shuffleChoices: exam.shuffleChoices,
    maxAttempts: exam.maxAttempts,
    defaultDueDays: exam.defaultDueDays,
    scoringMode: (exam.scoringMode as ExamFormValue["scoringMode"]) ?? null,
    showResultAfterSubmit: exam.showResultAfterSubmit,
    openAt: exam.openAt,
    closeAt: exam.closeAt,
    status: exam.status,
  };

  const bankItems: QuestionBankItem[] = bank.map((q) => ({
    id: q.id,
    type: q.type,
    text: q.text,
    difficulty: q.difficulty,
    tags: q.tags,
    lessonTitle: q.lesson
      ? `Bài ${q.lesson.order}: ${q.lesson.title}`
      : null,
  }));

  const selected: SelectedExamQuestion[] = exam.examQuestions.map((eq) => ({
    id: eq.id,
    questionId: eq.questionId,
    order: eq.order,
    points: eq.points,
    type: eq.question.type,
    text: eq.question.text,
    difficulty: eq.question.difficulty,
  }));

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/exams"
          className="mb-3 inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-700"
        >
          <ChevronLeft className="h-4 w-4" /> Quay lại danh sách
        </Link>
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h1 className="text-2xl font-bold text-neutral-900">
            Builder: <span className="text-orange-600">{exam.title}</span>
          </h1>
          <div className="flex items-center gap-4">
            <Link
              href={`/exams/${id}/preview`}
              className="text-sm font-semibold text-[#7C3AED] hover:underline"
            >
              Xem trước →
            </Link>
            <Link
              href={`/exams/${id}/attempts`}
              className="text-sm font-semibold text-[#7C3AED] hover:underline"
            >
              Xem bài làm →
            </Link>
          </div>
        </div>
      </div>

      <details className="rounded-xl border border-neutral-200 bg-white">
        <summary className="cursor-pointer px-6 py-4 text-sm font-bold uppercase tracking-wider text-neutral-700">
          Cấu hình đề thi
        </summary>
        <div className="px-6 pb-6">
          <ExamForm
            exam={examFormValue}
            classes={classes}
            lessons={lessons.map((l) => ({
              id: l.id,
              order: l.order,
              title: l.title,
              curriculumName: l.curriculum.name,
            }))}
          />
        </div>
      </details>

      <ExamBuilder
        examId={exam.id}
        bank={bankItems}
        initialSelected={selected}
        lessons={lessons.map((l) => ({
          id: l.id,
          order: l.order,
          title: l.title,
          curriculumName: l.curriculum.name,
        }))}
      />
    </div>
  );
}
