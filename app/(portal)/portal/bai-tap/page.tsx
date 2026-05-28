import { requireActiveStudent } from "@/lib/portal/session";
import { getStudentAssignments } from "@/lib/portal/learning";

export const dynamic = "force-dynamic";
export const metadata = { title: "Bài tập | Sata Robo" };

const STATUS: Record<string, { label: string; cls: string }> = {
  NOT_SUBMITTED: { label: "Chưa nộp", cls: "bg-neutral-100 text-neutral-600" },
  SUBMITTED: { label: "Đã nộp", cls: "bg-blue-100 text-blue-700" },
  LATE: { label: "Nộp trễ", cls: "bg-amber-100 text-amber-700" },
  GRADED: { label: "Đã chấm", cls: "bg-emerald-100 text-emerald-700" },
};

export default async function BaiTapPage() {
  const { studentId } = await requireActiveStudent();
  const assignments = await getStudentAssignments(studentId);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-neutral-900">Bài tập</h1>

      {assignments.length === 0 ? (
        <p className="rounded-xl border border-dashed border-neutral-300 bg-white p-8 text-center text-sm text-neutral-400">
          Chưa có bài tập nào được giao.
        </p>
      ) : (
        <ul className="space-y-2">
          {assignments.map((a) => {
            const st = STATUS[a.status] ?? STATUS.NOT_SUBMITTED;
            return (
              <li
                key={a.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-neutral-200 bg-white p-4"
              >
                <div className="min-w-0">
                  <p className="font-medium text-neutral-900">{a.title}</p>
                  <p className="text-xs text-neutral-500">
                    {a.className}
                    {a.dueAt &&
                      ` · Hạn ${new Date(a.dueAt).toLocaleDateString("vi-VN")}`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {a.status === "GRADED" && a.score !== null && (
                    <span className="text-sm font-bold text-neutral-800">
                      {a.score}/{a.totalPoints}
                    </span>
                  )}
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${st.cls}`}
                  >
                    {st.label}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <p className="rounded-lg bg-neutral-100 px-3 py-2 text-xs text-neutral-500">
        Nộp bài trực tuyến sẽ được mở trong bản cập nhật tới.
      </p>
    </div>
  );
}
