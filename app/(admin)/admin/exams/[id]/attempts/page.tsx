import Link from "next/link";
import { ChevronLeft, ClipboardList } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { AttemptStatus } from "@prisma/client";
import { GradeButton } from "../../_components/grade-button";

export const dynamic = "force-dynamic";

const ALLOWED_ROLES = ["SUPER_ADMIN", "CENTER_MANAGER", "TEACHER"];

const ATTEMPT_STATUS_INFO: Record<
  AttemptStatus,
  { label: string; color: string }
> = {
  IN_PROGRESS: { label: "Đang làm", color: "bg-amber-100 text-amber-700" },
  SUBMITTED: { label: "Đã nộp", color: "bg-blue-100 text-blue-700" },
  GRADED: { label: "Đã chấm", color: "bg-green-100 text-green-700" },
  REVIEWED: { label: "Đã xem", color: "bg-purple-100 text-purple-700" },
};

function fmtDateTime(d: Date | null) {
  if (!d) return "—";
  return new Date(d).toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ExamAttemptsPage({ params }: Props) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!ALLOWED_ROLES.includes(session.user.role)) {
    redirect("/dashboard?error=unauthorized");
  }

  const { id } = await params;

  const exam = await db.exam.findUnique({
    where: { id },
    include: {
      attempts: {
        orderBy: [{ status: "asc" }, { submittedAt: "desc" }],
        include: {
          student: {
            select: {
              id: true,
              name: true,
              studentCode: true,
              avatarUrl: true,
            },
          },
          gradedBy: { select: { fullName: true } },
        },
      },
      _count: { select: { examQuestions: true } },
    },
  });

  if (!exam) notFound();

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/exams"
          className="mb-3 inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-700"
        >
          <ChevronLeft className="h-4 w-4" /> Quay lại danh sách
        </Link>
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h1 className="flex items-center gap-2 text-2xl font-bold text-neutral-900">
            <ClipboardList className="h-6 w-6 text-[#7C3AED]" />
            Bài làm: <span className="text-orange-600">{exam.title}</span>
          </h1>
          <Link
            href={`/exams/${id}/builder`}
            className="text-sm font-semibold text-[#7C3AED] hover:underline"
          >
            ← Builder
          </Link>
        </div>
        <p className="mt-1 text-sm text-neutral-500">
          {exam._count.examQuestions} câu · Tổng điểm {exam.totalPoints} · Đạt ≥{" "}
          {exam.passingScore} · Thời lượng {exam.durationMinutes}′
        </p>
      </div>

      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-neutral-100">
            <thead className="bg-neutral-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-neutral-500">
                  Học viên
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-neutral-500">
                  Trạng thái
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-neutral-500">
                  Bắt đầu
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-neutral-500">
                  Nộp
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-neutral-500">
                  Điểm
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-neutral-500">
                  Đạt?
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-neutral-500">
                  GV chấm
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-neutral-500">
                  Hành động
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-50">
              {exam.attempts.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    className="px-4 py-12 text-center text-sm text-neutral-400"
                  >
                    Chưa có học viên nào làm bài.
                  </td>
                </tr>
              ) : (
                exam.attempts.map((a) => {
                  const statusInfo = ATTEMPT_STATUS_INFO[a.status];
                  return (
                    <tr key={a.id} className="hover:bg-neutral-50/60">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {a.student.avatarUrl ? (
                            <img
                              src={a.student.avatarUrl}
                              alt={a.student.name}
                              className="h-8 w-8 rounded-full border border-neutral-200 object-cover"
                            />
                          ) : (
                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-neutral-100 text-xs font-bold text-neutral-500">
                              {a.student.name.charAt(0).toUpperCase()}
                            </div>
                          )}
                          <div>
                            <div className="font-medium text-neutral-900">
                              {a.student.name}
                            </div>
                            {a.student.studentCode && (
                              <div className="text-xs text-neutral-400 tabular-nums">
                                {a.student.studentCode}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusInfo.color}`}
                        >
                          {statusInfo.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm tabular-nums text-neutral-500">
                        {fmtDateTime(a.startedAt)}
                      </td>
                      <td className="px-4 py-3 text-sm tabular-nums text-neutral-500">
                        {fmtDateTime(a.submittedAt)}
                      </td>
                      <td className="px-4 py-3 text-right text-sm tabular-nums font-semibold text-neutral-700">
                        {a.totalScore !== null && a.totalScore !== undefined
                          ? `${a.totalScore}/${exam.totalPoints}`
                          : "—"}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {a.passed === true ? (
                          <span className="inline-flex rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700">
                            Đạt
                          </span>
                        ) : a.passed === false ? (
                          <span className="inline-flex rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
                            Không đạt
                          </span>
                        ) : (
                          <span className="text-neutral-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-neutral-500">
                        {a.gradedBy?.fullName ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <GradeButton
                          attemptId={a.id}
                          disabled={a.status === "IN_PROGRESS"}
                        />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-xs text-neutral-600">
        <strong>Auto-chấm:</strong> chỉ chấm các câu MC/TF/SA. ESSAY/CODE giữ
        điểm thủ công (set qua Prisma Studio hoặc dialog manual grade tương
        lai). Public take-exam UI sẽ tạo ra ExamAttempt qua flow riêng (E4+).
      </div>
    </div>
  );
}
