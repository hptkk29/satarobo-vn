import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Star, EyeOff } from "lucide-react";
import { auth } from "@/lib/auth";
import { can } from "@/lib/auth/permissions";
import { resolveActor } from "@/lib/auth/actor";
import { db } from "@/lib/db";
import { getRound } from "@/lib/eval/rounds";
import { aggregateRound, getRoundDetail, type RoundAggregate } from "@/lib/eval/aggregate";
import { parseOptions } from "@/lib/eval/forms";

export const metadata = { title: "Kết quả đợt | Admin" };
export const dynamic = "force-dynamic";

export default async function RoundResultsPage({ params }: { params: Promise<{ roundId: string }> }) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const canDetail = can(session.user, "evaluations:view-detail");
  const canAggregate = can(session.user, "evaluations:view-aggregate");
  // AC4 — không quyền → không thấy gì.
  if (!canDetail && !canAggregate) redirect("/dashboard");

  const { roundId } = await params;
  const round = await getRound(roundId);
  if (!round) notFound();

  // Cách ly cơ sở cho người xem CHI TIẾT (QL): đợt gắn CS ngoài scope → chặn.
  if (canDetail) {
    const actor = await resolveActor(session.user.id);
    if (
      !actor.isSuperAdmin &&
      !actor.isHoLevel &&
      round.centerId &&
      !actor.visibleCenterIds.includes(round.centerId)
    ) {
      redirect("/evaluations");
    }
  }

  // GV chỉ-tổng-hợp + đợt TEACHER_EVAL → tổng hợp lọc theo CHÍNH MÌNH (AC4).
  const teacherFilter =
    !canDetail && round.scope === "TEACHER_EVAL" ? session.user.id : undefined;

  const aggregate = await aggregateRound(roundId, teacherFilter ? { teacherId: teacherFilter } : undefined);

  // Chi tiết (chỉ view-detail) — kèm danh tính.
  let detail: Awaited<ReturnType<typeof getRoundDetail>> = [];
  let nameMap = new Map<string, string>();
  if (canDetail) {
    detail = await getRoundDetail(roundId);
    const studentIds = [...new Set(detail.map((d) => d.studentId).filter((x): x is string => !!x))];
    const teacherIds = [...new Set(detail.map((d) => d.teacherId).filter((x): x is string => !!x))];
    const parentIds = [...new Set(detail.map((d) => d.parentUserId).filter((x): x is string => !!x))];
    const [students, users] = await Promise.all([
      db.student.findMany({ where: { id: { in: studentIds } }, select: { id: true, name: true } }),
      db.user.findMany({ where: { id: { in: [...teacherIds, ...parentIds] } }, select: { id: true, name: true } }),
    ]);
    nameMap = new Map([
      ...students.map((s) => [s.id, s.name] as const),
      ...users.map((u) => [u.id, u.name ?? "—"] as const),
    ]);
  }

  return (
    <div className="max-w-3xl space-y-5 p-6">
      <Link href="/evaluations" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
        <ArrowLeft className="h-4 w-4" /> Về danh sách
      </Link>

      <div>
        <h1 className="text-xl font-bold text-gray-900">{round.name}</h1>
        <p className="mt-0.5 text-sm text-gray-500">
          {round.form.title} · {round.scope === "TEACHER_EVAL" ? "Đánh giá GV" : "Khảo sát cơ sở"} ·{" "}
          {aggregate.responseCount} phản hồi
        </p>
        {!canDetail && (
          <p className="mt-1 inline-flex items-center gap-1 text-xs text-gray-400">
            <EyeOff className="h-3.5 w-3.5" /> Chế độ tổng hợp ẩn danh (không hiển thị danh tính học viên)
          </p>
        )}
      </div>

      <AggregateView aggregate={aggregate} />

      {canDetail && detail.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wider text-gray-500">Chi tiết phản hồi</h2>
          <div className="space-y-2">
            {detail.map((d) => (
              <div key={d.id} className="rounded-lg border border-gray-200 bg-white p-3 text-sm">
                <p className="text-xs text-gray-400">
                  {new Date(d.submittedAt).toLocaleString("vi-VN")}
                  {d.teacherId && ` · GV: ${nameMap.get(d.teacherId) ?? "—"}`}
                  {d.studentId && ` · HV: ${nameMap.get(d.studentId) ?? "—"}`}
                  {d.parentUserId && ` · PH: ${nameMap.get(d.parentUserId) ?? "—"}`}
                </p>
                <ul className="mt-1 space-y-0.5 text-gray-700">
                  {d.answers.map((a, i) => (
                    <li key={i}>
                      {a.valueNumber != null && `⭐ ${a.valueNumber}/5`}
                      {parseOptions(a.valueOptions).length > 0 && parseOptions(a.valueOptions).join(", ")}
                      {a.valueText && `“${a.valueText}”`}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function AggregateView({ aggregate }: { aggregate: RoundAggregate }) {
  if (aggregate.responseCount === 0) {
    return <p className="rounded-xl border border-dashed border-gray-300 bg-white p-6 text-center text-sm text-gray-400">Chưa có phản hồi.</p>;
  }
  return (
    <div className="space-y-3">
      {aggregate.questions.map((q) => (
        <div key={q.questionId} className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="font-medium text-gray-900">{q.label}</p>
          {q.type === "STAR_RATING" && (
            <div className="mt-2 text-sm text-gray-700">
              <span className="inline-flex items-center gap-1 text-lg font-bold text-amber-500">
                <Star className="h-5 w-5 fill-amber-400" /> {q.avg ?? "—"}
              </span>
              <span className="ml-2 text-xs text-gray-400">({q.count} lượt)</span>
              <div className="mt-1 space-y-0.5">
                {([5, 4, 3, 2, 1] as const).map((s) => (
                  <div key={s} className="flex items-center gap-2 text-xs">
                    <span className="w-6 text-gray-500">{s}★</span>
                    <span className="tabular-nums text-gray-600">{q.distribution[s]}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {(q.type === "RADIO" || q.type === "CHECKBOX") && (
            <ul className="mt-2 space-y-1 text-sm text-gray-700">
              {q.optionCounts.map((o) => (
                <li key={o.option} className="flex justify-between">
                  <span>{o.option}</span>
                  <span className="font-semibold tabular-nums text-purple-600">{o.count}</span>
                </li>
              ))}
            </ul>
          )}
          {q.type === "TEXTBOX" && (
            <ul className="mt-2 space-y-1 text-sm text-gray-600">
              {q.texts.length === 0 ? (
                <li className="text-gray-400">Chưa có ý kiến.</li>
              ) : (
                q.texts.map((t, i) => <li key={i} className="rounded bg-gray-50 px-2 py-1">“{t}”</li>)
              )}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}
