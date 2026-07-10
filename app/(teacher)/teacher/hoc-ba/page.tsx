// app/(teacher)/teacher/hoc-ba/page.tsx — #06 (L6): màn "Học bạ" site GV (câu 55).
//
// 2 mức điều hướng qua searchParams (không route động — giống /teacher/lop):
//   (a) không tham số   → danh sách ghi danh các LỚP MÌNH (mirror home #4:
//                         sdb.enrollment where classId ∈ assignedClassIds, deletedAt
//                         null) + trạng thái học bạ + mốc buổi 5/12 (#17) + badge
//                         "GV sửa được".
//   (b) ?enrollmentId=… → EDITOR: tái dùng ReportCardEditor + data assembly Y HỆT
//                         trang admin /admin/report-cards/[enrollmentId]. Mọi read
//                         raw đi qua hàm lib/** (getEnrollmentContext… +
//                         report-card-editor-data) — app/(teacher) KHÔNG import
//                         @/lib/db trần (ESLint R6-F1).
//
// Gác ĐỌC chống IDOR: enrollment.classId PHẢI ∈ actor.assignedClassIds TRƯỚC khi
// assemble (GV chỉ lớp mình; checkEnrollmentScope trong action đã gác đường GHI).
// GV capabilities = ["manage"] (KHÔNG review — duyệt/phát hành làm trên admin) →
// PENDING_REVIEW/PUBLISHED editor read-only; RECALLED chỉ QL/Đào tạo sửa lại
// (canEditReportCardContent, #17 Gap3). Nút Lưu/Nộp gọi thẳng action của admin
// (saveReportCardAction/transitionReportCardAction — tự gate qua authContext).
//
// ⚠️ Câu 46: KHÔNG SĐT/email/tên phụ huynh trong payload client — list chỉ tên HV
// + lớp + trạng thái; editor không nhận contact PH (props chỉ metrics/tiêu chí/nhận xét).
import Link from "next/link";
import { auth } from "@/lib/auth";
import { resolveActor } from "@/lib/auth/actor";
import { scopedDb } from "@/lib/db-scope";
import { checkPermission } from "@/lib/auth/check-permission";
import {
  REPORT_CARD_STATUS_LABEL,
  canEditReportCardContent,
  computeReportCardMetrics,
  getCourseCriteria,
  getEnrollmentContext,
  normalizePeriodComments,
  type PeriodComment,
  type ReportCardStatusValue,
} from "@/lib/lms/report-card";
import {
  REPORT_CARD_MILESTONES,
  ensureMilestonePeriods,
  milestoneLabel,
  missingMilestoneComments,
  reachedMilestones,
} from "@/lib/lms/report-card-milestone";
import {
  countCompletedClassSessions,
  getReportCardEditorRecord,
} from "@/lib/lms/report-card-editor-data";
import { Badge } from "@/components/ui/badge";
import { ReportCardEditor } from "@/app/(admin)/admin/report-cards/_components/report-card-editor";

export const metadata = { title: "Học bạ | Giáo viên Sata Robo" };

// Màu pill trạng thái — đồng bộ trang admin /admin/report-cards (STATUS_CLASS).
const STATUS_CLASS: Record<ReportCardStatusValue, string> = {
  DRAFT: "bg-neutral-100 text-neutral-600",
  PENDING_REVIEW: "bg-amber-100 text-amber-700",
  PUBLISHED: "bg-emerald-100 text-emerald-700",
  RECALLED: "bg-rose-100 text-rose-700",
};

/** Initials avatar (port visual từ mock hoc-ba — không thêm dependency). */
const initials = (name: string) =>
  name
    .split(" ")
    .slice(-2)
    .map((w) => w[0] ?? "")
    .join("")
    .toUpperCase();

export default async function TeacherReportCardsPage({
  searchParams,
}: {
  searchParams: Promise<{ enrollmentId?: string }>;
}) {
  const session = await auth();
  if (!session?.user) return null; // layout đã gate — guard cho type-narrow

  const { enrollmentId } = await searchParams;
  const actor = await resolveActor(session.user.id);

  // ── (b) Editor 1 học bạ — mirror admin [enrollmentId] ───────────────────────
  if (enrollmentId) {
    const enr = await getEnrollmentContext(enrollmentId); // lib đọc raw — chỉ ngữ cảnh
    // Gác ĐỌC chống IDOR TRƯỚC khi assemble: GV chỉ mở học bạ lớp mình phụ trách.
    if (!enr || !actor.assignedClassIds.has(enr.classId)) return <NotYours />;

    // Site GV: capability CHỈ 'manage' — canReview cố định false (câu 55: duyệt trên admin).
    const canManage = await checkPermission("report-cards:manage");

    // Data assembly Y HỆT trang admin (read raw qua helper lib — scope đã gác ở trên).
    const [criteria, metrics, rc, completedSessions] = await Promise.all([
      getCourseCriteria(enr.courseId),
      computeReportCardMetrics(enrollmentId),
      getReportCardEditorRecord(enrollmentId),
      countCompletedClassSessions(enr.classId),
    ]);

    const status = (rc?.status ?? "DRAFT") as ReportCardStatusValue;
    const scoreMap = new Map((rc?.scores ?? []).map((s) => [s.criterionId, s]));

    return (
      <div className="space-y-5">
        <BackLink href="?" label="← Học bạ lớp tôi" />
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">
            Học bạ — {enr.studentName}
            {enr.studentCode ? (
              <span className="text-neutral-400"> ({enr.studentCode})</span>
            ) : null}
          </h1>
          <p className="mt-1 text-sm text-neutral-500">
            {enr.courseName} · {enr.className}
          </p>
        </div>

        {criteria.length === 0 ? (
          <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Khoá học <b>{enr.courseName}</b> chưa có tiêu chí năng lực — liên hệ Đào tạo
            cấu hình tiêu chí trước khi nhập học bạ.
          </div>
        ) : null}

        <ReportCardEditor
          enrollmentId={enrollmentId}
          status={status}
          // GV manage-only: DRAFT sửa được; RECALLED cần 'review' (QL/Đào tạo) → khoá
          // nội dung (#17 Gap3) — khớp gate canEditReportCardContent trong action.
          editable={canManage && canEditReportCardContent(status, ["manage"])}
          canManage={canManage}
          canReview={false}
          publishedAt={rc?.publishedAt ? rc.publishedAt.toISOString() : null}
          metrics={metrics}
          criteria={criteria}
          finalComment={rc?.finalComment ?? ""}
          completionStatus={rc?.completionStatus ?? ""}
          periodComments={ensureMilestonePeriods(
            completedSessions,
            normalizePeriodComments(rc?.periodComments),
          )}
          scores={criteria.map((c) => {
            const s = scoreMap.get(c.id);
            return { criterionId: c.id, level: s?.level ?? 0, note: s?.note ?? "" };
          })}
        />
      </div>
    );
  }

  // ── (a) Danh sách ghi danh các lớp mình (mirror home #4) ────────────────────
  const sdb = scopedDb(actor);
  const classIds = [...actor.assignedClassIds];

  const enrollments = classIds.length
    ? await sdb.enrollment.findMany({
        where: { classId: { in: classIds }, deletedAt: null },
        select: {
          id: true,
          classId: true,
          student: { select: { name: true } }, // câu 46: CHỈ tên HV, KHÔNG contact PH
          class: { select: { name: true } },
        },
        orderBy: [{ class: { name: "asc" } }, { createdAt: "asc" }],
      })
    : [];

  const enrollmentIds = enrollments.map((e) => e.id);
  const cards = enrollmentIds.length
    ? await sdb.reportCard.findMany({
        where: { enrollmentId: { in: enrollmentIds } },
        select: { enrollmentId: true, status: true, periodComments: true },
      })
    : [];
  // Số buổi COMPLETED mỗi lớp — xác định mốc 5/12 đã đạt (#17 Gap 1, câu 55).
  const completedRows = classIds.length
    ? await sdb.classSession.groupBy({
        by: ["classId"],
        where: { classId: { in: classIds }, status: "COMPLETED" },
        _count: { _all: true },
      })
    : [];

  const cardByEnrollment = new Map(cards.map((c) => [c.enrollmentId, c]));
  const completedByClass = new Map(completedRows.map((r) => [r.classId, r._count._all]));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-neutral-900">Học bạ</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Học bạ năng lực học viên các lớp bạn phụ trách — viết nhận xét mốc buổi 5/12
          rồi nộp duyệt.
        </p>
      </div>

      {enrollments.length === 0 ? (
        <EmptyBox text="Bạn chưa được phân công lớp nào hoặc lớp chưa có học viên." />
      ) : (
        <section className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-neutral-200 bg-neutral-50 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                  <th scope="col" className="px-4 py-3">Học viên</th>
                  <th scope="col" className="px-4 py-3">Lớp</th>
                  <th scope="col" className="px-4 py-3">Trạng thái học bạ</th>
                  <th scope="col" className="px-4 py-3">Mốc buổi</th>
                  <th scope="col" className="px-4 py-3 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {enrollments.map((e) => {
                  const card = cardByEnrollment.get(e.id);
                  const status = (card?.status ?? null) as ReportCardStatusValue | null;
                  // Chưa có học bạ = lưu lần đầu sẽ tạo DRAFT → xét quyền sửa như DRAFT.
                  const editableByTeacher = canEditReportCardContent(status ?? "DRAFT", ["manage"]);
                  return (
                    <tr
                      key={e.id}
                      className="border-b border-neutral-100 transition-colors last:border-0 hover:bg-neutral-50"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-purple-100 text-xs font-semibold text-purple-700">
                            {initials(e.student.name)}
                          </span>
                          <span className="font-medium text-neutral-900">{e.student.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-neutral-600">{e.class.name}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <StatusPill status={status} />
                          {editableByTeacher ? (
                            <Badge variant="outline" className="border-emerald-300 text-emerald-700">
                              GV sửa được
                            </Badge>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <MilestoneCell
                          completedSessions={completedByClass.get(e.classId) ?? 0}
                          periods={normalizePeriodComments(card?.periodComments)}
                        />
                      </td>
                      <td className="px-4 py-3 text-right">
                        {/* href CHỈ-query (giữ path hiện tại): chạy đúng cả trên host
                            giaovien (clean URL /hoc-ba) LẪN localhost (/teacher/hoc-ba). */}
                        <Link
                          href={`?enrollmentId=${e.id}`}
                          className="rounded-md bg-purple-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-purple-800"
                        >
                          {card ? "Mở học bạ" : "Nhập học bạ"}
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: ReportCardStatusValue | null }) {
  if (!status) return <span className="text-xs text-neutral-400">Chưa có</span>;
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLASS[status]}`}>
      {REPORT_CARD_STATUS_LABEL[status]}
    </span>
  );
}

/**
 * Mốc buổi 5/12 (#17, câu 55) — 3 trạng thái mỗi mốc:
 * chưa đạt buổi N (xám) · đạt nhưng THIẾU nhận xét (amber — việc GV cần làm)
 * · đã viết nhận xét (emerald). Tính bằng reachedMilestones/missingMilestoneComments.
 */
function MilestoneCell({
  completedSessions,
  periods,
}: {
  completedSessions: number;
  periods: PeriodComment[];
}) {
  const reached = new Set<number>(reachedMilestones(completedSessions));
  const missing = new Set<number>(missingMilestoneComments(completedSessions, periods));
  return (
    <div className="flex flex-wrap gap-1">
      {REPORT_CARD_MILESTONES.map((m) => {
        const cls = !reached.has(m)
          ? "border border-neutral-200 text-neutral-400"
          : missing.has(m)
            ? "bg-amber-100 text-amber-700"
            : "bg-emerald-100 text-emerald-700";
        const text = !reached.has(m)
          ? `Buổi ${m}`
          : missing.has(m)
            ? `Buổi ${m} · thiếu nhận xét`
            : `Buổi ${m} ✓`;
        return (
          <span
            key={m}
            title={milestoneLabel(m)}
            className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}
          >
            {text}
          </span>
        );
      })}
    </div>
  );
}

function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="text-sm text-neutral-500 hover:text-neutral-800">
      {label}
    </Link>
  );
}

function EmptyBox({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-neutral-300 bg-white p-10 text-center">
      <p className="text-sm text-neutral-500">{text}</p>
    </div>
  );
}

function NotYours() {
  return (
    <div className="space-y-4">
      <BackLink href="?" label="← Học bạ lớp tôi" />
      <EmptyBox text="Học bạ không thuộc lớp bạn phụ trách." />
    </div>
  );
}
