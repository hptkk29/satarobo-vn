import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { QuestionForm } from "../_components/question-form";

export const dynamic = "force-dynamic";

const ALLOWED_ROLES = ["SUPER_ADMIN", "MANAGER", "TEACHER"];

export default async function NewQuestionPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!ALLOWED_ROLES.includes(session.user.role)) {
    redirect("/dashboard?error=unauthorized");
  }

  const lessons = await db.lesson.findMany({
    where: { curriculum: { isActive: true } },
    include: { curriculum: { select: { name: true } } },
    orderBy: [{ curriculumId: "asc" }, { order: "asc" }],
    take: 500,
  });

  return (
    <div className="space-y-4">
      <div>
        <Link
          href="/questions"
          className="mb-3 inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-700"
        >
          <ChevronLeft className="h-4 w-4" /> Quay lại danh sách
        </Link>
        <h1 className="text-2xl font-bold text-neutral-900">Thêm câu hỏi mới</h1>
      </div>

      <QuestionForm
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
