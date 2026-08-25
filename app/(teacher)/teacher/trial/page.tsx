// app/(teacher)/teacher/trial/page.tsx — Site GV (L6): "Danh sách Trial".
//
// 2 mức qua searchParams (không route động):
//   (a) không tham số   → HV Trial nhóm theo NGÀY + khung giờ (own-rows GV).
//   (b) ?enrollmentId=… → phiếu rubric của một ca. Kèm `&sessionId=…` (GĐ4) để chọn
//                         BUỔI được chấm; bỏ trống = buổi đang xếp cho ca.
//
// Quyền: TEACHER có sẵn trials:view + trials:feedback (không đổi permissions).
// Data: own-rows theo teacherId qua lib/lms/teacher-schedule (db ở lib, không phải
// app/(teacher) — né ESLint chặn @/lib/db trần).
//
// ⚠️ Câu 46 (chốt với chủ nhiệm): site GV ẨN HẲN phụ huynh cho lớp Trial — chỉ hiện
// tên HV + năm sinh + khoá quan tâm. Helper đã strip lead.parentName/phone/email.
import Link from "next/link";
import { redirect } from "next/navigation";
import { Ban } from "lucide-react";
import { auth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { checkPermission } from "@/lib/auth/check-permission";
import {
  getTeacherTrialRoster,
  getTeacherTrialRubricContext,
} from "@/lib/lms/teacher-schedule";
import { PageHeader } from "../_components/ui/page-header";
import { EmptyState } from "../_components/ui/empty-state";
import { TrialList, type TrialSlotView } from "./_components/trial-list";
import { TrialEvalForm } from "./_components/trial-eval-form";
import { BackLink } from "../_components/ui/back-link";

export const metadata = { title: "Danh sách Trial | Giáo viên Sata Robo" };

const VN_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Mốc UTC 00:00 của NGÀY hôm nay theo giờ VN — khớp cột @db.Date của Trial. */
function vnTodayUtc(now = new Date()): Date {
  const vn = new Date(now.getTime() + VN_OFFSET_MS);
  return new Date(
    Date.UTC(vn.getUTCFullYear(), vn.getUTCMonth(), vn.getUTCDate()),
  );
}

// @db.Date là UTC 00:00 của ngày lịch VN → format theo UTC ra đúng ngày.
const dateLabelFmt = new Intl.DateTimeFormat("vi-VN", {
  weekday: "long",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "UTC",
});
function isoKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default async function TeacherTrialPage({
  searchParams,
}: {
  searchParams: Promise<{ enrollmentId?: string; sessionId?: string }>;
}) {
  const session = await auth();
  if (!session?.user) return null; // layout đã gate login + role TEACHER

  if (!(await checkPermission("trials:view"))) redirect("/");

  const { enrollmentId, sessionId } = await searchParams;

  // ── (b) Phiếu đánh giá rubric 1 HV trải nghiệm ──────────────────────────────
  if (enrollmentId) {
    const ctx = await getTeacherTrialRubricContext(
      session.user.id,
      enrollmentId,
      sessionId,
    );
    if (!ctx) return <NotYours />;

    // Buổi đang chấm quyết định CẢ biểu mẫu lẫn PDF — phải nói rõ trên URL, vì
    // `scheduledSessionId` của ca chỉ đổi khi dời lịch (xem ghi chú GĐ4 ở helper).
    const selected = ctx.trialClassSessionId;
    const pdfHref = selected
      ? `/teacher/trial/pdf/${ctx.enrollmentId}?sessionId=${selected}`
      : `/teacher/trial/pdf/${ctx.enrollmentId}`;

    return (
      <div className="space-y-4">
        <BackLink href="?" label="Danh sách Trial" />
        <PageHeader
          title="Phiếu đánh giá buổi thử"
          subtitle={ctx.trialClassName}
        />

        {ctx.sessions.length > 0 && (
          <section className="t-card px-5 py-4">
            <h2 className="text-xs font-bold tracking-wide text-muted-foreground uppercase">
              Buổi được chấm
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Mỗi buổi một phiếu riêng. Chọn buổi trước khi nhập điểm.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {ctx.sessions.map((s) => {
                const active = s.id === selected;
                return (
                  <Link
                    key={s.id}
                    href={`?enrollmentId=${ctx.enrollmentId}&sessionId=${s.id}`}
                    aria-current={active ? "true" : undefined}
                    className={cn(
                      "rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors",
                      active
                        ? "border-primary bg-primary text-white"
                        : "border-border text-foreground hover:bg-muted",
                    )}
                  >
                    {s.label}
                    {s.isScheduled ? " · đang xếp" : ""}
                    {s.evaluated ? " ✓" : ""}
                  </Link>
                );
              })}
            </div>
            {!selected && (
              <p className="mt-3 text-xs text-state-warning-ink">
                Ca này chưa được xếp buổi — chọn một buổi ở trên trước khi lưu
                phiếu.
              </p>
            )}
          </section>
        )}

        <TrialEvalForm
          // `key` ép React dựng lại form khi đổi buổi: state điểm nằm trong
          // useState khởi tạo 1 lần, không có key thì bấm sang buổi khác vẫn
          // thấy điểm của buổi cũ.
          key={selected ?? "no-session"}
          enrollmentId={ctx.enrollmentId}
          sessionId={selected}
          studentName={ctx.studentName}
          courseName={ctx.courseName}
          existing={
            ctx.existing
              ? {
                  scores: ctx.existing.scores,
                  generalComment: ctx.existing.generalComment,
                  orientation: ctx.existing.orientation,
                }
              : null
          }
          pdfHref={pdfHref}
        />
      </div>
    );
  }

  // ── (a) Danh sách HV Trial nhóm theo ngày ───────────────────────────────────
  const today = vnTodayUtc();
  const from = new Date(today.getTime() - 30 * DAY_MS);
  const to = new Date(today.getTime() + 31 * DAY_MS);
  const roster = await getTeacherTrialRoster(session.user.id, from, to);

  const slots: TrialSlotView[] = roster.slots.map((s) => ({
    sessionId: s.sessionId,
    trialClassName: s.trialClassName,
    dateKey: isoKey(s.date),
    dateLabel: capitalize(dateLabelFmt.format(s.date)),
    timeLabel: `${s.startTime}-${s.endTime}`,
    status: s.status,
    students: s.students.map((st) => ({
      enrollmentId: st.enrollmentId,
      studentName: st.studentName,
      birthYear: st.birthYear,
      courseName: st.courseName,
      status: st.status,
      evaluated: st.evaluated,
    })),
  }));

  return (
    <div>
      <PageHeader
        title="Học viên Trial"
        subtitle="Buổi Trial chia theo ngày và khung giờ. Sau buổi, nhập phiếu đánh giá cho từng học viên."
      />

      {/* #2 — HV chưa gắn buổi cụ thể (data cũ): hiển thị riêng để không ai tàng hình. */}
      {roster.unassigned.length > 0 && (
        <section className="t-card mb-6 overflow-hidden">
          <header className="border-b border-border bg-muted/40 px-5 py-3">
            <h2 className="text-sm font-bold text-foreground">
              Chưa xếp buổi ({roster.unassigned.length})
            </h2>
            <p className="text-xs text-muted-foreground">
              Học viên đã ghi danh lớp Trial của bạn nhưng chưa gắn vào buổi cụ
              thể — nhờ quản lý xếp buổi, hoặc nhập phiếu đánh giá trực tiếp.
            </p>
          </header>
          <ul className="divide-y divide-border/60">
            {roster.unassigned.map((st) => (
              <li
                key={st.enrollmentId}
                className="flex flex-wrap items-center justify-between gap-2 px-5 py-3"
              >
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {st.studentName}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {st.trialClassName}
                    {st.birthYear ? ` · ${st.birthYear}` : ""}
                    {st.courseName ? ` · ${st.courseName}` : ""}
                  </p>
                </div>
                <Link
                  href={`?enrollmentId=${st.enrollmentId}`}
                  className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted"
                >
                  {st.evaluated ? "Xem phiếu" : "Nhập phiếu"}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <TrialList slots={slots} />
    </div>
  );
}

function NotYours() {
  return (
    <div className="space-y-4">
      <BackLink href="?" label="Danh sách Trial" />
      <EmptyState icon={Ban} title="Buổi Trial không thuộc bạn phụ trách." />
    </div>
  );
}
