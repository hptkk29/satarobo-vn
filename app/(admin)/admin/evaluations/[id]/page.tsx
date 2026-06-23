import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { auth } from "@/lib/auth";
import { can } from "@/lib/auth/permissions";
import { getFormWithQuestions, formHasResponses, parseOptions, type QuestionType } from "@/lib/eval/forms";
import { FormEditor } from "./_edit";

export const metadata = { title: "Sửa form | Admin" };
export const dynamic = "force-dynamic";

export default async function FormEditPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!can(session.user, "evaluations:manage")) redirect("/dashboard");

  const { id } = await params;
  const form = await getFormWithQuestions(id);
  if (!form) notFound();

  const locked = await formHasResponses(id);

  const initial = form.questions.map((q) => ({
    type: q.type as QuestionType,
    label: q.label,
    options: parseOptions(q.options),
    required: q.required,
  }));

  return (
    <div className="max-w-3xl space-y-4 p-6">
      <Link href="/evaluations" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
        <ArrowLeft className="h-4 w-4" /> Về danh sách
      </Link>
      <div>
        <h1 className="text-xl font-bold text-gray-900">{form.title}</h1>
        <p className="mt-0.5 text-sm text-gray-500">
          {form.scope === "TEACHER_EVAL"
            ? "Đánh giá GV (học viên)"
            : form.scope === "CENTER_SURVEY"
              ? "Khảo sát cơ sở (phụ huynh)"
              : "Đánh giá buổi học (GV chấm HS)"}{" "}
          · {form.status}
        </p>
      </div>
      <FormEditor formId={id} initial={initial} locked={locked} />
    </div>
  );
}
