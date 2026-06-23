import { requireActiveStudent } from "@/lib/portal/session";
import { db } from "@/lib/db";
import { isEvalV2Enabled } from "@/lib/flags";
import { getEligibleCenterRounds } from "@/lib/eval/center-survey";
import { SurveyForm } from "./survey-form";
import { CenterSurveyForm } from "./center-survey";

export const dynamic = "force-dynamic";
export const metadata = { title: "Khảo sát | Sata Robo", robots: { index: false } };

export default async function KhaoSatPage() {
  const { ctx, studentId } = await requireActiveStudent();

  // FL4-03 — Khảo sát cơ sở CENTER_SURVEY (engine EvalForm, 4 loại câu hỏi) là luồng
  // chính. Survey/NPS dưới đây giữ song song (2-phase, sẽ deprecate — KHÔNG xoá).
  const centerRounds = isEvalV2Enabled() ? await getEligibleCenterRounds(ctx.parentUserId) : [];

  const student = await db.student.findUnique({
    where: { id: studentId },
    select: { centerId: true, preferredCenterId: true },
  });
  const centerIds = [student?.centerId, student?.preferredCenterId].filter((x): x is string => !!x);

  // @deprecated Survey/NPS cũ — thay dần bằng CENTER_SURVEY ở trên. Vẫn đọc để PH
  // trả nốt khảo sát đang chạy; không tạo mới qua admin (xem _actions.ts createSurvey).
  const surveys = await db.survey.findMany({
    where: {
      isActive: true,
      OR: [{ centerId: null }, ...(centerIds.length ? [{ centerId: { in: centerIds } }] : [])],
    },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: { id: true, title: true },
  });

  // Loại survey đã trả lời cho con này.
  const answered = new Set(
    (await db.surveyResponse.findMany({ where: { studentId, surveyId: { in: surveys.map((s) => s.id) } }, select: { surveyId: true } }))
      .map((r) => r.surveyId),
  );
  const pending = surveys.filter((s) => !answered.has(s.id));

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold text-neutral-900">Khảo sát</h1>

      {centerRounds.length > 0 && (
        <div className="space-y-3">
          {centerRounds.map((r) => (
            <CenterSurveyForm key={r.roundId} roundId={r.roundId} title={r.title} questions={r.questions} />
          ))}
        </div>
      )}

      {pending.length === 0 && centerRounds.length === 0 ? (
        <p className="rounded-xl border border-dashed border-neutral-300 bg-white p-6 text-center text-sm text-neutral-400">
          Hiện không có khảo sát nào cần trả lời. Cảm ơn quý phụ huynh!
        </p>
      ) : (
        <div className="space-y-3">
          {pending.map((s) => (
            <SurveyForm key={s.id} surveyId={s.id} title={s.title} />
          ))}
        </div>
      )}
    </div>
  );
}
