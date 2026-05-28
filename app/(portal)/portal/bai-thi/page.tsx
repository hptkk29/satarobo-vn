import { requireActiveStudent } from "@/lib/portal/session";
import { getStudentExams } from "@/lib/portal/learning";

export const dynamic = "force-dynamic";
export const metadata = { title: "Bài thi | Sata Robo" };

export default async function BaiThiPage() {
  const { studentId } = await requireActiveStudent();
  const exams = await getStudentExams(studentId);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-neutral-900">Bài thi</h1>

      {exams.length === 0 ? (
        <p className="rounded-xl border border-dashed border-neutral-300 bg-white p-8 text-center text-sm text-neutral-400">
          Chưa có bài thi nào được mở.
        </p>
      ) : (
        <ul className="space-y-2">
          {exams.map((e) => {
            const done =
              e.attemptStatus === "SUBMITTED" ||
              e.attemptStatus === "GRADED" ||
              e.attemptStatus === "REVIEWED";
            return (
              <li
                key={e.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-neutral-200 bg-white p-4"
              >
                <div className="min-w-0">
                  <p className="font-medium text-neutral-900">{e.title}</p>
                  <p className="text-xs text-neutral-500">
                    {e.className ? `${e.className} · ` : ""}
                    {e.durationMinutes} phút
                    {e.closeAt &&
                      ` · Đóng ${new Date(e.closeAt).toLocaleDateString("vi-VN")}`}
                  </p>
                </div>
                {done ? (
                  <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                    {e.totalScore !== null ? `Điểm: ${e.totalScore}` : "Đã làm"}
                  </span>
                ) : e.isOpen ? (
                  <span className="rounded-full bg-orange-100 px-2.5 py-0.5 text-xs font-semibold text-orange-700">
                    Đang mở
                  </span>
                ) : (
                  <span className="rounded-full bg-neutral-100 px-2.5 py-0.5 text-xs font-semibold text-neutral-500">
                    Chưa mở
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <p className="rounded-lg bg-neutral-100 px-3 py-2 text-xs text-neutral-500">
        Làm bài thi trực tuyến sẽ được mở trong bản cập nhật tới.
      </p>
    </div>
  );
}
