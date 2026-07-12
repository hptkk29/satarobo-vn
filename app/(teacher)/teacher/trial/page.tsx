// app/(teacher)/teacher/trial/page.tsx — Site GV (L6): "Danh sách Trial".
//
// 2 mức qua searchParams (không route động):
//   (a) không tham số   → HV Trial nhóm theo NGÀY + khung giờ (own-rows GV).
//   (b) ?sessionId=…     → phiếu đánh giá buổi (reuse TrialSessionEvalFill — action
//                          session-eval đã gate TEACHER theo teacherId lớp/buổi).
//
// Quyền: TEACHER có sẵn trials:view + trials:feedback (không đổi permissions).
// Data: own-rows theo teacherId qua lib/lms/teacher-schedule (db ở lib, không phải
// app/(teacher) — né ESLint chặn @/lib/db trần).
//
// ⚠️ Câu 46 (chốt với chủ nhiệm): site GV ẨN HẲN phụ huynh cho lớp Trial — chỉ hiện
// tên HV + năm sinh + khoá quan tâm. Helper đã strip lead.parentName/phone/email.
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Ban } from "lucide-react";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/auth/check-permission";
import {
  getTeacherTrialRoster,
  getTeacherTrialEvalProps,
} from "@/lib/lms/teacher-schedule";
import { TrialSessionEvalFill } from "@/app/(admin)/admin/evaluations/_components/trial-session-eval-fill";
import { PageHeader } from "../_components/ui/page-header";
import { EmptyState } from "../_components/ui/empty-state";
import { TrialList, type TrialSlotView } from "./_components/trial-list";

export const metadata = { title: "Danh sách Trial | Giáo viên Sata Robo" };

const VN_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Mốc UTC 00:00 của NGÀY hôm nay theo giờ VN — khớp cột @db.Date của Trial. */
function vnTodayUtc(now = new Date()): Date {
  const vn = new Date(now.getTime() + VN_OFFSET_MS);
  return new Date(Date.UTC(vn.getUTCFullYear(), vn.getUTCMonth(), vn.getUTCDate()));
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
  searchParams: Promise<{ sessionId?: string }>;
}) {
  const session = await auth();
  if (!session?.user) return null; // layout đã gate login + role TEACHER

  if (!(await checkPermission("trials:view"))) redirect("/");

  const { sessionId } = await searchParams;

  // ── (b) Phiếu đánh giá 1 buổi Trial ─────────────────────────────────────────
  if (sessionId) {
    const props = await getTeacherTrialEvalProps(session.user.id, sessionId);
    if (!props) return <NotYours />;
    const canFill = await checkPermission("trials:feedback");

    return (
      <div className="space-y-4">
        <BackLink href="?" label="Danh sách Trial" />
        <PageHeader
          title={`Phiếu đánh giá — ${props.trialClassName}`}
          subtitle="Nhận xét buổi trải nghiệm cho từng học viên. Chọn buổi ở ô bên dưới nếu lớp có nhiều buổi."
        />
        {props.evalStudents.length === 0 ? (
          <EmptyState icon={Ban} title="Buổi chưa xếp học viên nào để đánh giá." />
        ) : (
          <div className="t-card p-4">
            <TrialSessionEvalFill
              trialSessions={props.evalSessions}
              students={props.evalStudents}
              canEdit={canFill}
            />
          </div>
        )}
      </div>
    );
  }

  // ── (a) Danh sách HV Trial nhóm theo ngày ───────────────────────────────────
  const today = vnTodayUtc();
  const from = new Date(today.getTime() - 30 * DAY_MS);
  const to = new Date(today.getTime() + 31 * DAY_MS);
  const roster = await getTeacherTrialRoster(session.user.id, from, to);

  const slots: TrialSlotView[] = roster.map((s) => ({
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
    })),
  }));

  return (
    <div>
      <PageHeader
        title="Học viên Trial"
        subtitle="Buổi Trial chia theo ngày và khung giờ. Sau buổi, nhập phiếu đánh giá cho từng học viên."
      />
      <TrialList slots={slots} />
    </div>
  );
}

function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 rounded-sm text-sm text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
    >
      <ArrowLeft className="h-4 w-4" aria-hidden />
      {label}
    </Link>
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
