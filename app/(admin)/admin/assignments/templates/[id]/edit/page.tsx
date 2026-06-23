import Link from "next/link";
import { ChevronLeft, ListChecks } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { can } from "@/lib/auth/permissions";
import { scopedDb } from "@/lib/db-scope";
import { resolveActor } from "@/lib/auth/actor";
import { buildQuestionWhere } from "@/lib/questions/filter";
import { TemplateForm, type TemplateFormValue } from "../../_components/template-form";
import { GenerateToClass } from "../../_components/generate-to-class";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

const TYPE_LABEL: Record<string, string> = {
  MULTIPLE_CHOICE: "Trắc nghiệm",
  TRUE_FALSE: "Đúng / Sai",
  SHORT_ANSWER: "Trả lời ngắn",
  ESSAY: "Tự luận",
  CODE: "Lập trình",
};

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
  // Hiển thị tham chiếu các câu hỏi thuộc khung CT này để soạn mẫu.
  const bankQuestions = template.curriculumId
    ? await sdb.question.findMany({
        where: buildQuestionWhere({
          curriculumId: template.curriculumId,
          publicOnly: true,
        }),
        select: { id: true, questionCode: true, type: true, text: true },
        orderBy: { createdAt: "desc" },
        take: 50,
      })
    : [];

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

      <GenerateToClass templateId={template.id} classes={classes} />

      <section className="rounded-xl border border-neutral-200 bg-white">
        <header className="border-b border-neutral-100 p-4">
          <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-neutral-700">
            <ListChecks className="h-4 w-4 text-[#7C3AED]" />
            Câu hỏi thuộc khung chương trình ({bankQuestions.length})
          </h2>
          <p className="mt-0.5 text-xs text-neutral-500">
            {template.curriculumId
              ? "Câu hỏi public trong ngân hàng khớp khung CT của mẫu này (tham chiếu khi soạn)."
              : "Gắn khung chương trình cho mẫu để xem các câu hỏi liên quan trong ngân hàng."}
          </p>
        </header>
        {bankQuestions.length === 0 ? (
          <div className="p-6 text-center text-sm text-neutral-400">
            {template.curriculumId
              ? "Chưa có câu hỏi public nào trong khung chương trình này."
              : "—"}
          </div>
        ) : (
          <ul className="divide-y divide-neutral-50">
            {bankQuestions.map((q) => (
              <li key={q.id} className="flex items-start gap-3 px-4 py-3">
                <span className="mt-0.5 inline-flex shrink-0 rounded-full bg-purple-50 px-2 py-0.5 text-[11px] font-semibold text-purple-700">
                  {TYPE_LABEL[q.type] ?? q.type}
                </span>
                <div className="min-w-0">
                  <div className="line-clamp-2 text-sm text-neutral-800">
                    {q.text}
                  </div>
                  {q.questionCode && (
                    <div className="text-xs text-neutral-400 tabular-nums">
                      {q.questionCode}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
