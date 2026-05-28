import { FileText, Download } from "lucide-react";
import { requireActiveStudent } from "@/lib/portal/session";
import { getStudentLessons } from "@/lib/portal/learning";

export const dynamic = "force-dynamic";
export const metadata = { title: "Bài giảng | Sata Robo" };

export default async function BaiGiangPage() {
  const { studentId } = await requireActiveStudent();
  const lessons = await getStudentLessons(studentId);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-neutral-900">Bài giảng</h1>
      <p className="-mt-4 text-sm text-neutral-500">
        Nội dung các buổi đã học cùng tài liệu đính kèm.
      </p>

      {lessons.length === 0 ? (
        <p className="rounded-xl border border-dashed border-neutral-300 bg-white p-8 text-center text-sm text-neutral-400">
          Chưa có bài giảng nào (giáo viên chưa gắn bài học cho buổi đã dạy).
        </p>
      ) : (
        <div className="space-y-3">
          {lessons.map((l) => (
            <article
              key={l.id}
              className="rounded-xl border border-neutral-200 bg-white p-4"
            >
              <div className="flex items-start justify-between gap-2">
                <h2 className="font-semibold text-neutral-900">{l.title}</h2>
                {l.taughtAt && (
                  <span className="shrink-0 text-xs text-neutral-400">
                    {new Date(l.taughtAt).toLocaleDateString("vi-VN")}
                  </span>
                )}
              </div>
              {l.description && (
                <p className="mt-1 text-sm text-neutral-600">{l.description}</p>
              )}
              {l.objectives.length > 0 && (
                <ul className="mt-2 list-inside list-disc text-sm text-neutral-600">
                  {l.objectives.map((o, i) => (
                    <li key={i}>{o}</li>
                  ))}
                </ul>
              )}
              {l.documents.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {l.documents.map((d) => (
                    <a
                      key={d.id}
                      href={d.fileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-100"
                    >
                      <FileText className="h-3.5 w-3.5" />
                      {d.title}
                      <Download className="h-3 w-3 text-neutral-400" />
                    </a>
                  ))}
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
