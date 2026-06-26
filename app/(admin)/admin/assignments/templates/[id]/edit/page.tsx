import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { can } from "@/lib/auth/permissions";
import { scopedDb } from "@/lib/db-scope";
import { resolveActor } from "@/lib/auth/actor";
import { buildQuestionWhere } from "@/lib/questions/filter";
import { TemplateForm, type TemplateFormValue } from "../../_components/template-form";
import { GenerateToClass } from "../../_components/generate-to-class";
import {
  TemplateQuestionPicker,
  type QSummary,
} from "../../_components/template-question-picker";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EditTemplatePage({ params }: Props) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!can(session.user, "assignments:edit")) {
    redirect("/assignments?error=unauthorized");
  }

  const { id } = await params;

  // Class ∈ SCOPED_MODELS → dropdown lớp (cho panel sinh bài giao) chỉ hiện lớp
  // trong tầm nhìn cơ sở của actor (CS1 không thấy lớp CS2). Template/khung CT/buổi
  // học toàn hệ thống (∉ SCOPED_MODELS → scopedDb pass-through). Đi qua scopedDb theo
  // chuẩn R6-F1 (không import @/lib/db trần trong admin).
  const sdb = scopedDb(await resolveActor(session.user.id));

  const template = await sdb.assignmentTemplate.findUnique({ where: { id } });
  if (!template) notFound();

  const [curricula, lessons, classes] = await Promise.all([
    sdb.curriculum.findMany({
      where: { isActive: true },
      orderBy: [{ courseId: "asc" }, { version: "asc" }],
      select: { id: true, name: true, version: true },
      take: 200,
    }),
    sdb.lesson.findMany({
      where: { curriculum: { isActive: true } },
      include: { curriculum: { select: { name: true } } },
      orderBy: [{ curriculumId: "asc" }, { order: "asc" }],
      take: 500,
    }),
    sdb.class.findMany({
      where: { deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true, classCode: true },
      take: 200,
    }),
  ]);

  // Picker câu hỏi cho template: lọc ngân hàng câu hỏi theo KHUNG CT của template,
  // chỉ câu hỏi public (chia sẻ giữa GV) — dùng helper chung buildQuestionWhere (FL1-03).
  // Câu được chọn LƯU thành AssignmentTemplateQuestion; khi sinh bài giao sẽ CLONE.
  const [bankQuestions, attachedLinks] = await Promise.all([
    template.curriculumId
      ? sdb.question.findMany({
          where: buildQuestionWhere({
            curriculumId: template.curriculumId,
            publicOnly: true,
          }),
          select: { id: true, questionCode: true, type: true, text: true },
          orderBy: { createdAt: "desc" },
          take: 200,
        })
      : Promise.resolve([] as QSummary[]),
    sdb.assignmentTemplateQuestion.findMany({
      where: { templateId: id },
      orderBy: { order: "asc" },
      select: {
        question: { select: { id: true, questionCode: true, type: true, text: true } },
      },
    }),
  ]);

  const attachedQuestions: QSummary[] = attachedLinks.map((l) => l.question);

  const formValue: TemplateFormValue = {
    id: template.id,
    title: template.title,
    description: template.description,
    instructions: template.instructions,
    kind: template.kind,
    curriculumId: template.curriculumId,
    lessonId: template.lessonId,
    totalPoints: template.totalPoints,
    allowText: template.allowText,
    allowFile: template.allowFile,
  };

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/assignments/templates"
          className="mb-3 inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-700"
        >
          <ChevronLeft className="h-4 w-4" /> Quay lại danh sách mẫu
        </Link>
        <h1 className="text-2xl font-bold text-neutral-900">
          Sửa mẫu:{" "}
          <span className="font-bold text-orange-600">{template.title}</span>
        </h1>
      </div>

      <TemplateForm
        template={formValue}
        curricula={curricula}
        lessons={lessons.map((l) => ({
          id: l.id,
          order: l.order,
          title: l.title,
          curriculumId: l.curriculumId,
          curriculumName: l.curriculum.name,
        }))}
      />

      <TemplateQuestionPicker
        templateId={template.id}
        hasCurriculum={Boolean(template.curriculumId)}
        bank={bankQuestions}
        attached={attachedQuestions}
      />

      <GenerateToClass templateId={template.id} classes={classes} />
    </div>
  );
}
