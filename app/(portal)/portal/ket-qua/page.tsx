import { requireActiveStudent } from "@/lib/portal/session";
import { getStudentClasses, getStudentExamResults } from "@/lib/portal/learning";
import { getStudentProgress } from "@/lib/progress";

export const dynamic = "force-dynamic";
export const metadata = { title: "Kết quả | Sata Robo" };

export default async function KetQuaPage() {
  const { studentId } = await requireActiveStudent();
  const [classes, examResults] = await Promise.all([
    getStudentClasses(studentId),
    getStudentExamResults(studentId),
  ]);
  const results = await Promise.all(
    classes.map(async (c) => ({
      cls: c,
      p: await getStudentProgress(studentId, c.id),
    })),
  );

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-neutral-900">Kết quả học tập</h1>

      {results.length === 0 ? (
        <p className="rounded-xl border border-dashed border-neutral-300 bg-white p-8 text-center text-sm text-neutral-400">
          Chưa có dữ liệu kết quả.
        </p>
      ) : (
        <div className="space-y-3">
          {results.map(({ cls, p }) => (
            <section
              key={cls.id}
              className="rounded-xl border border-neutral-200 bg-white p-4"
            >
              <h2 className="font-semibold text-neutral-900">{cls.name}</h2>
              <p className="mb-3 text-xs text-neutral-500">{cls.courseName}</p>
              <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Metric
                  label="Điểm danh"
                  value={`${p.attendedSessions}/${p.totalSessions}`}
                  sub={`${p.attendanceRate}%`}
                />
                <Metric
                  label="Bài học"
                  value={`${p.coveredLessons}/${p.totalLessons}`}
                />
                <Metric
                  label="Bài tập nộp"
                  value={`${p.submittedAssignments}/${p.totalAssignments}`}
                />
                <Metric
                  label="Điểm TB"
                  value={p.averageScore !== null ? `${p.averageScore}/10` : "—"}
                />
                <Metric
                  label="Đề thi đạt"
                  value={
                    p.examAttempts > 0
                      ? `${p.passedExams}/${p.examAttempts}`
                      : "—"
                  }
                />
              </dl>
            </section>
          ))}
        </div>
      )}

      {examResults.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wider text-neutral-700">
            Kết quả bài thi
          </h2>
          <ul className="space-y-2">
            {examResults.map((r) => (
              <li
                key={r.attemptId}
                className="rounded-xl border border-neutral-200 bg-white p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium text-neutral-900">{r.examTitle}</p>
                  {r.graded ? (
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        r.passed
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-rose-100 text-rose-700"
                      }`}
                    >
                      {r.totalScore ?? 0}/{r.totalPoints}
                      {r.passed ? " · Đạt" : " · Chưa đạt"}
                    </span>
                  ) : (
                    <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
                      Chờ giáo viên chấm
                    </span>
                  )}
                </div>
                {r.graded && r.feedback && (
                  <p className="mt-2 rounded-lg bg-neutral-50 p-2 text-sm text-neutral-600">
                    Nhận xét: {r.feedback}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Metric({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-lg bg-neutral-50 p-3">
      <p className="text-xs text-neutral-500">{label}</p>
      <p className="mt-0.5 text-lg font-bold text-neutral-900">{value}</p>
      {sub && <p className="text-xs text-neutral-400">{sub}</p>}
    </div>
  );
}
