import Link from "next/link";
import { FileSpreadsheet, HelpCircle, Plus } from "lucide-react";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { QuestionType, QuestionDifficulty, type Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

const ALLOWED_ROLES = ["SUPER_ADMIN", "MANAGER", "TEACHER"];

const TYPE_INFO: Record<QuestionType, { label: string; color: string }> = {
  MULTIPLE_CHOICE: { label: "Trắc nghiệm", color: "bg-blue-100 text-blue-700" },
  TRUE_FALSE: { label: "Đúng/Sai", color: "bg-emerald-100 text-emerald-700" },
  SHORT_ANSWER: { label: "Trả lời ngắn", color: "bg-amber-100 text-amber-700" },
  ESSAY: { label: "Tự luận", color: "bg-purple-100 text-purple-700" },
  CODE: { label: "Lập trình", color: "bg-neutral-100 text-neutral-800" },
};

const DIFFICULTY_INFO: Record<QuestionDifficulty, { label: string; color: string }> = {
  EASY: { label: "Dễ", color: "bg-green-100 text-green-700" },
  MEDIUM: { label: "TB", color: "bg-yellow-100 text-yellow-700" },
  HARD: { label: "Khó", color: "bg-orange-100 text-orange-700" },
  EXPERT: { label: "Chuyên gia", color: "bg-red-100 text-red-700" },
};

const VALID_TYPES = Object.values(QuestionType);
const VALID_DIFFICULTIES = Object.values(QuestionDifficulty);

interface SearchParams {
  searchParams: Promise<{
    q?: string;
    type?: string;
    difficulty?: string;
    lessonId?: string;
    tag?: string;
  }>;
}

export default async function QuestionsPage({ searchParams }: SearchParams) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!ALLOWED_ROLES.includes(session.user.role)) {
    redirect("/dashboard?error=unauthorized");
  }

  const sp = await searchParams;
  const q = sp.q?.trim() || undefined;
  const typeFilter =
    sp.type && VALID_TYPES.includes(sp.type as QuestionType)
      ? (sp.type as QuestionType)
      : undefined;
  const difficultyFilter =
    sp.difficulty &&
    VALID_DIFFICULTIES.includes(sp.difficulty as QuestionDifficulty)
      ? (sp.difficulty as QuestionDifficulty)
      : undefined;
  const lessonFilter = sp.lessonId?.trim() || undefined;
  const tagFilter = sp.tag?.trim() || undefined;

  const where: Prisma.QuestionWhereInput = {
    ...(typeFilter ? { type: typeFilter } : {}),
    ...(difficultyFilter ? { difficulty: difficultyFilter } : {}),
    ...(lessonFilter ? { lessonId: lessonFilter } : {}),
    ...(tagFilter ? { tags: { has: tagFilter } } : {}),
    ...(q
      ? {
          OR: [
            { text: { contains: q, mode: "insensitive" as const } },
            { questionCode: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [questions, lessons] = await Promise.all([
    db.question.findMany({
      where,
      include: {
        lesson: {
          select: {
            order: true,
            title: true,
            curriculum: { select: { name: true } },
          },
        },
        author: { select: { fullName: true } },
        _count: { select: { choices: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: 100,
    }),
    db.lesson.findMany({
      where: { curriculum: { isActive: true } },
      include: { curriculum: { select: { name: true } } },
      orderBy: [{ curriculumId: "asc" }, { order: "asc" }],
      take: 500,
    }),
  ]);

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
            <HelpCircle className="h-6 w-6 text-[#7C3AED]" />
            Ngân hàng câu hỏi
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            {questions.length > 0
              ? `${questions.length} câu hỏi`
              : "Chưa có câu hỏi nào"}
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/questions/new"
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#7C3AED] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:opacity-90"
          >
            <Plus className="h-4 w-4" />
            Thêm câu hỏi
          </Link>
          <Link
            href="/questions/import"
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            <FileSpreadsheet className="h-4 w-4" />
            Import Excel
          </Link>
        </div>
      </div>

      <form
        method="GET"
        className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5"
      >
        <input
          name="q"
          defaultValue={q}
          placeholder="Tìm nội dung / mã câu hỏi..."
          className="lg:col-span-2 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[#7C3AED] focus:outline-none focus:ring-2 focus:ring-[#7C3AED]/20"
        />
        <select
          name="type"
          defaultValue={typeFilter ?? ""}
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[#7C3AED] focus:outline-none"
        >
          <option value="">Mọi loại</option>
          {Object.entries(TYPE_INFO).map(([v, { label }]) => (
            <option key={v} value={v}>
              {label}
            </option>
          ))}
        </select>
        <select
          name="difficulty"
          defaultValue={difficultyFilter ?? ""}
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[#7C3AED] focus:outline-none"
        >
          <option value="">Mọi độ khó</option>
          {Object.entries(DIFFICULTY_INFO).map(([v, { label }]) => (
            <option key={v} value={v}>
              {label}
            </option>
          ))}
        </select>
        <select
          name="lessonId"
          defaultValue={lessonFilter ?? ""}
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[#7C3AED] focus:outline-none"
        >
          <option value="">Mọi bài học</option>
          {lessons.map((l) => (
            <option key={l.id} value={l.id}>
              {l.curriculum.name} — Bài {l.order}: {l.title}
            </option>
          ))}
        </select>
        <input
          name="tag"
          defaultValue={tagFilter}
          placeholder="Tag (vd: loop)"
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[#7C3AED] focus:outline-none"
        />
        <button
          type="submit"
          className="rounded-lg bg-[#7C3AED] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 sm:col-span-2 lg:col-span-5"
        >
          Áp dụng bộ lọc
        </button>
      </form>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-100">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Loại
                </th>
                <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Độ khó
                </th>
                <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Câu hỏi
                </th>
                <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Bài học
                </th>
                <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Tags
                </th>
                <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Soạn
                </th>
                <th className="px-3 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Hành động
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {questions.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-12 text-center text-sm text-gray-400"
                  >
                    Chưa có câu hỏi nào khớp bộ lọc.{" "}
                    <Link
                      href="/questions/new"
                      className="text-[#7C3AED] hover:underline"
                    >
                      Tạo mới →
                    </Link>
                  </td>
                </tr>
              ) : (
                questions.map((q) => {
                  const typeInfo = TYPE_INFO[q.type];
                  const diffInfo = DIFFICULTY_INFO[q.difficulty];
                  return (
                    <tr key={q.id} className="hover:bg-gray-50/60">
                      <td className="px-3 py-3">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${typeInfo.color}`}
                        >
                          {typeInfo.label}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${diffInfo.color}`}
                        >
                          {diffInfo.label}
                        </span>
                      </td>
                      <td className="px-3 py-3 max-w-md">
                        <div className="text-sm text-gray-900 line-clamp-2">
                          {q.text}
                        </div>
                        {q.questionCode && (
                          <div className="text-xs text-gray-400 tabular-nums">
                            {q.questionCode}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-3 text-xs text-gray-600 max-w-[180px]">
                        {q.lesson ? (
                          <>
                            <div className="font-medium">
                              {q.lesson.curriculum.name}
                            </div>
                            <div className="text-gray-400">
                              Bài {q.lesson.order}: {q.lesson.title}
                            </div>
                          </>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap gap-1">
                          {q.tags.slice(0, 4).map((t) => (
                            <span
                              key={t}
                              className="inline-flex rounded bg-neutral-100 px-1.5 py-0.5 text-xs text-neutral-600"
                            >
                              {t}
                            </span>
                          ))}
                          {q.tags.length > 4 && (
                            <span className="text-xs text-neutral-400">
                              +{q.tags.length - 4}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-xs text-gray-500">
                        {q.author?.fullName ?? "—"}
                      </td>
                      <td className="px-3 py-3 text-right">
                        <Link
                          href={`/questions/${q.id}/edit`}
                          className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2.5 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                        >
                          Sửa
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
