import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { can } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { resolveActor } from "@/lib/auth/actor";
import {
  actorCapabilities,
  checkEnrollmentScope,
  computeReportCardMetrics,
  getCourseCriteria,
  getEnrollmentContext,
  isReportCardEditable,
  normalizePeriodComments,
  type ReportCardStatusValue,
} from "@/lib/lms/report-card";
import { ReportCardEditor } from "../_components/report-card-editor";

export const metadata = { title: "Nhập học bạ | Admin" };
export const dynamic = "force-dynamic";

export default async function ReportCardEditorPage({
  params,
}: {
  params: Promise<{ enrollmentId: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const canManage = can(session.user, "report-cards:manage");
  const canReview = can(session.user, "report-cards:review");
  if (!canManage && !canReview) redirect("/dashboard");

  const { enrollmentId } = await params;
  const enr = await getEnrollmentContext(enrollmentId);
  if (!enr) redirect("/report-cards");

  const actor = await resolveActor(session.user.id);
  const capabilities = actorCapabilities({ manage: canManage, review: canReview });
  const scope = checkEnrollmentScope({
    actor,
    centerId: enr.centerId,
    classId: enr.classId,
    capabilities,
  });

  if (!scope.ok) {
    return (
      <div className="space-y-3 p-4">
        <Link href="/report-cards" className="text-sm text-purple-700">
          ← Danh sách học bạ
        </Link>
        <p className="text-sm text-rose-600">{scope.error}</p>
      </div>
    );
  }

  const [criteria, metrics, rc] = await Promise.all([
    getCourseCriteria(enr.courseId),
    computeReportCardMetrics(enrollmentId),
    db.reportCard.findUnique({
      where: { enrollmentId },
      select: {
        status: true,
        finalComment: true,
        completionStatus: true,
        periodComments: true,
        publishedAt: true,
        scores: { select: { criterionId: true, level: true, note: true } },
      },
    }),
  ]);

  const status = (rc?.status ?? "DRAFT") as ReportCardStatusValue;
  const scoreMap = new Map((rc?.scores ?? []).map((s) => [s.criterionId, s]));

  return (
    <div className="space-y-5 p-4">
      <div>
        <Link href={`/report-cards?classId=${enr.classId}`} className="text-sm text-purple-700">
          ← {enr.className}
        </Link>
        <h1 className="mt-1 text-xl font-bold text-neutral-900">
          Học bạ — {enr.studentName}
          {enr.studentCode ? <span className="text-neutral-400"> ({enr.studentCode})</span> : null}
        </h1>
        <p className="text-sm text-neutral-500">
          {enr.courseName} · {enr.className}
        </p>
      </div>

      {criteria.length === 0 ? (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Khoá học <b>{enr.courseName}</b> chưa có tiêu chí năng lực. Đào tạo cần{" "}
          <Link href="/report-cards/criteria" className="font-medium underline">
            cấu hình tiêu chí
          </Link>{" "}
          trước khi nhập học bạ.
        </div>
      ) : null}

      <ReportCardEditor
        enrollmentId={enrollmentId}
        status={status}
        editable={isReportCardEditable(status) && canManage}
        canManage={canManage}
        canReview={canReview}
        publishedAt={rc?.publishedAt ? rc.publishedAt.toISOString() : null}
        metrics={metrics}
        criteria={criteria}
        finalComment={rc?.finalComment ?? ""}
        completionStatus={rc?.completionStatus ?? ""}
        periodComments={normalizePeriodComments(rc?.periodComments)}
        scores={criteria.map((c) => {
          const s = scoreMap.get(c.id);
          return { criterionId: c.id, level: s?.level ?? 0, note: s?.note ?? "" };
        })}
      />
    </div>
  );
}
