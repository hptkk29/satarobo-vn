import Link from "next/link";
import { ChevronRight } from "lucide-react";
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
              <li key={a.id}>
                <Link
                  href={`/portal/bai-tap/${a.id}`}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-neutral-200 bg-white p-4 transition-shadow hover:shadow-sm"
                >
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 font-medium text-neutral-900">
                      {a.title}
                      {a.kind === "HOMEWORK" && (
                        <span className="rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-bold text-purple-700">
                          Về nhà
                        </span>
                      )}
                    </p>
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
                    <ChevronRight className="h-4 w-4 text-neutral-300" />
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
