import { redirect } from "next/navigation";
import { Gauge } from "lucide-react";
import { auth } from "@/lib/auth";
import { can } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { scopedDb, getModelVisibleCenterIds } from "@/lib/db-scope";
import { resolveActor } from "@/lib/auth/actor";
import { computeNps } from "@/lib/survey/nps";
import { SurveyAdmin } from "./_components/survey-admin";

export const metadata = { title: "Khảo sát / NPS | Admin" };
export const dynamic = "force-dynamic";

export default async function SurveyPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!can(session.user, "parent-feedback:view")) redirect("/dashboard");

  // Cách ly cơ sở: Survey/SurveyResponse ∈ SCOPED_MODELS. SurveyResponse → sdb auto-scope
  // (centerId IN tầm nhìn). Survey CÓ THỂ centerId=null (khảo sát dùng chung toàn hệ thống)
  // → KHÔNG dùng auto-scope (sẽ ẩn mất khảo sát chung); scope thủ công "null OR visible".
  const actor = await resolveActor(session.user.id);
  const sdb = scopedDb(actor);
  const visibleSurveyCenters = getModelVisibleCenterIds("Survey", actor);
  const surveyWhere =
    visibleSurveyCenters === "ALL"
      ? {}
      : { OR: [{ centerId: null }, { centerId: { in: visibleSurveyCenters } }] };

  const [centers, surveys, responses] = await Promise.all([
    db.center.findMany({ where: { isActive: true }, orderBy: { displayOrder: "asc" }, select: { id: true, name: true } }),
    db.survey.findMany({
      where: surveyWhere,
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { id: true, title: true, milestone: true, isActive: true, _count: { select: { responses: true } } },
    }),
    sdb.surveyResponse.findMany({
      where: { npsScore: { not: null } },
      select: { npsScore: true, centerId: true, surveyId: true },
      take: 5000,
    }),
  ]);

  // P1-h — NPS theo TỪNG khảo sát (để admin thấy "ra điểm" ngay ở danh sách).
  const bySurvey = new Map<string, number[]>();
  for (const r of responses) {
    const arr = bySurvey.get(r.surveyId) ?? [];
    arr.push(r.npsScore as number);
    bySurvey.set(r.surveyId, arr);
  }

  const overall = computeNps(responses.map((r) => r.npsScore));
  const centerName = new Map(centers.map((c) => [c.id, c.name]));
  const byCenter = new Map<string, number[]>();
  for (const r of responses) {
    const k = r.centerId ?? "—";
    const arr = byCenter.get(k) ?? [];
    arr.push(r.npsScore as number);
    byCenter.set(k, arr);
  }

  return (
    <div className="max-w-4xl p-6">
      <div className="mb-4">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
          <Gauge className="h-6 w-6 text-[#7C3AED]" /> Khảo sát / NPS
        </h1>
        <p className="mt-1 text-sm text-gray-500">Chỉ số NPS làm cơ sở KPI cho bộ phận CSKH.</p>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="NPS tổng" value={overall.nps} tone={overall.nps >= 50 ? "ok" : overall.nps >= 0 ? "warn" : "bad"} />
        <Stat label="Promoter" value={overall.promoters} />
        <Stat label="Passive" value={overall.passives} />
        <Stat label="Detractor" value={overall.detractors} />
      </div>

      {byCenter.size > 0 && (
        <section className="mb-4 rounded-xl border border-gray-200 bg-white p-4">
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wider text-gray-500">NPS theo cơ sở</h2>
          <ul className="divide-y divide-gray-100">
            {[...byCenter.entries()].map(([cid, scores]) => {
              const r = computeNps(scores);
              return (
                <li key={cid} className="flex items-center justify-between py-2 text-sm">
                  <span className="text-gray-700">{cid === "—" ? "Chưa gắn cơ sở" : centerName.get(cid) ?? cid}</span>
                  <span className="font-bold tabular-nums text-[#7C3AED]">{r.nps} <span className="text-xs font-normal text-gray-400">({r.total} phản hồi)</span></span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <SurveyAdmin
        centers={centers}
        surveys={surveys.map((s) => ({
          id: s.id,
          title: s.title,
          milestone: s.milestone,
          isActive: s.isActive,
          responses: s._count.responses,
          nps: bySurvey.has(s.id) ? computeNps(bySurvey.get(s.id)!).nps : null,
        }))}
      />
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "ok" | "warn" | "bad" }) {
  const cls = tone === "ok" ? "text-emerald-600" : tone === "bad" ? "text-rose-600" : tone === "warn" ? "text-amber-600" : "text-[#7C3AED]";
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3">
      <div className={`text-2xl font-bold tabular-nums ${cls}`}>{value}</div>
      <div className="mt-0.5 text-xs text-gray-500">{label}</div>
    </div>
  );
}
