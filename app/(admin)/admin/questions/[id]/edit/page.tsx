import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  QuestionForm,
  type QuestionFormValue,
} from "../../_components/question-form";

export const dynamic = "force-dynamic";

const ALLOWED_ROLES = ["SUPER_ADMIN", "MANAGER", "TEACHER"];

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EditQuestionPage({ params }: Props) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!ALLOWED_ROLES.includes(session.user.role)) {
    redirect("/admin/dashboard?error=unauthorized");
  }

  const { id } = await params;

  const [question, lessons] = await Promise.all([
    db.question.findUnique({
      where: { id },
      include: {
        choices: { orderBy: { order: "asc" } },
      },
    }),
    db.lesson.findMany({
      where: { curriculum: { isActive: true } },
      include: { curriculum: { select: { name: true } } },
      orderBy: [{ curriculumId: "asc" }, { order: "asc" }],
      take: 500,
    }),
  ]);

  if (!question) notFound();

  const formValue: QuestionFormValue = {
    id: question.id,
    questionCode: question.questionCode,
    type: question.type,
    text: question.text,
    explanation: question.explanation,
    difficulty: question.difficulty,
    tags: question.tags,
    lessonId: question.lessonId,
    correctAnswer: question.correctAnswer,
    choices: question.choices.map((c) => ({
      order: c.order,
      text: c.text,
      isCorrect: c.isCorrect,
    })),
    isPublic: question.isPublic,
    notes: question.notes,
  };

  return (
    <div className="space-y-4">
      <div>
        <Link
          href="/admin/questions"
          className="mb-3 inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-700"
        >
          <ChevronLeft className="h-4 w-4" /> Quay lại danh sách
        </Link>
        <h1 className="text-2xl font-bold text-neutral-900">
          Sửa câu hỏi:{" "}
          <span className="font-bold text-orange-600">
            {question.text.slice(0, 80)}
            {question.text.length > 80 ? "…" : ""}
          </span>
        </h1>
      </div>

      <QuestionForm
        question={formValue}
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
