import { requireActiveStudent } from "@/lib/portal/session";
import { db } from "@/lib/db";
import { isEvalV2Enabled } from "@/lib/flags";
import { isRoundOpen } from "@/lib/eval/rounds";
import { CURRENTLY_STUDYING_STATUSES } from "@/lib/eval/eligibility";
import { parseOptions, type QuestionType } from "@/lib/eval/forms";
import type { PortalQuestion } from "../danh-gia-gv/_fields";
import { SurveyForm } from "./survey-form";
import { CenterSurveyForm } from "./center-survey";

export const dynamic = "force-dynamic";
export const metadata = { title: "Khảo sát | Sata Robo", robots: { index: false } };

export default async function KhaoSatPage() {
  const { ctx, studentId } = await requireActiveStudent();

  const student = await db.student.findUnique({
    where: { id: studentId },
    select: { centerId: true, preferredCenterId: true },
  });
  const centerIds = [student?.centerId, student?.preferredCenterId].filter((x): x is string => !!x);

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

  // R7-16 — Khảo sát cơ sở round-based (sau flag). NPS ở trên giữ nguyên.
  const centerRounds = await getEligibleCenterRounds(ctx.parentUserId);

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

/** R7-16 — đợt CENTER_SURVEY đang mở mà PH đủ điều kiện + chưa làm. */
async function getEligibleCenterRounds(parentUserId: string) {
  if (!isEvalV2Enabled()) return [];

  // Cơ sở mà PH đang có con theo học.
  const enr = await db.enrollment.findMany({
    where: { student: { parentUserId, deletedAt: null }, status: { in: CURRENTLY_STUDYING_STATUSES } },
    select: { class: { select: { centerId: true } } },
  });
  const myCenters = new Set(enr.map((e) => e.class.centerId).filter((x): x is string => !!x));
  if (myCenters.size === 0) return [];

  const rounds = await db.evaluationRound.findMany({
    where: {
      scope: "CENTER_SURVEY",
      status: "OPEN",
      OR: [{ centerId: null }, { centerId: { in: [...myCenters] } }],
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      status: true,
      opensAt: true,
      closesAt: true,
      form: { select: { questions: { orderBy: { order: "asc" } } } },
    },
  });

  const out: { roundId: string; title: string; questions: PortalQuestion[] }[] = [];
  for (const r of rounds) {
    if (!isRoundOpen(r)) continue;
    const already = await db.evalResponse.findFirst({
      where: { roundId: r.id, parentUserId },
      select: { id: true },
    });
    if (already) continue;
    out.push({
      roundId: r.id,
      title: r.name,
      questions: r.form.questions.map((q) => ({
        id: q.id,
        type: q.type as QuestionType,
        label: q.label,
        options: parseOptions(q.options),
        required: q.required,
      })),
    });
  }
  return out;
}
