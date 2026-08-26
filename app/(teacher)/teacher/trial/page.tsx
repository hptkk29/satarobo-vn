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
// ⚠️ ĐẢO "câu 46" (25/08, chủ dự án): bảng Trial NAY CÓ cột "Phụ huynh" — chỉ TÊN.
// SĐT/email phụ huynh vẫn không bao giờ ra khỏi server (xem ghi chú dài ở khối
// getTeacherTrialTable trong lib/lms/teacher-schedule.ts).
import { redirect } from "next/navigation";
import { Ban } from "lucide-react";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/auth/check-permission";
import {
  getTeacherTrialTable,
  getTeacherTrialRubricContext,
  type TrialTableRow,
} from "@/lib/lms/teacher-schedule";
import { PageHeader } from "../_components/ui/page-header";
import { EmptyState } from "../_components/ui/empty-state";
import { TrialList, type TrialRowView } from "./_components/trial-list";
import { TrialEvalForm } from "./_components/trial-eval-form";
import { BackLink } from "../_components/ui/back-link";

export const metadata = { title: "Danh sách Trial | Giáo viên Sata Robo" };

const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

/** "từ ngày hiện tại đến hết 7 ngày tiếp theo" (chủ dự án 25/08). */
const TRIAL_WINDOW_DAYS = 7;

/** Mốc UTC 00:00 của NGÀY hôm nay theo giờ VN — khớp cột @db.Date của Trial. */
function vnTodayUtc(now = new Date()): Date {
  const vn = new Date(now.getTime() + VN_OFFSET_MS);
  return new Date(
    Date.UTC(vn.getUTCFullYear(), vn.getUTCMonth(), vn.getUTCDate()),
  );
}

// Nhãn ngày cho cột "Buổi" ("CN, 05/07"). @db.Date là UTC 00:00 của ngày lịch VN →
// format theo UTC mới ra đúng ngày. Format Ở ĐÂY (server) chứ không ở client: máy GV
// không chắc chạy +07, và render server ↔ hydrate client lệch nhau là vỡ hydration.
const dateShortFmt = new Intl.DateTimeFormat("vi-VN", {
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
  timeZone: "UTC",
});
function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default async function TeacherTrialPage({
  searchParams,
}: {
  searchParams: Promise<{ enrollmentId?: string }>;
}) {
  const session = await auth();
  if (!session?.user) return null; // layout đã gate login + role TEACHER

  if (!(await checkPermission("trials:view"))) redirect("/");

  const { enrollmentId } = await searchParams;

  // ── (b) Phiếu đánh giá rubric 1 HV trải nghiệm ──────────────────────────────
  if (enrollmentId) {
    const ctx = await getTeacherTrialRubricContext(
      session.user.id,
      enrollmentId,
    );
    if (!ctx) return <NotYours />;

    return (
      <div className="space-y-4">
        <BackLink href="?" label="Danh sách Trial" />
        <PageHeader
          title="Phiếu đánh giá buổi thử"
          subtitle={ctx.trialClassName}
        />
        <TrialEvalForm
          enrollmentId={ctx.enrollmentId}
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
          /* 25/08 — bỏ nút "Xuất PDF" khỏi màn Trial của GV. */
          pdfHref={null}
        />
      </div>
    );
  }

  // ── (a) Hai bảng: "Các suất sắp Trial" (7 ngày tới) + "Đã Trial" ───────────
  const today = vnTodayUtc();
  const table = await getTeacherTrialTable(session.user.id, {
    today,
    days: TRIAL_WINDOW_DAYS,
  });

  /** "Hoàng Gia Bảo - 2016" — ghép ở SERVER để client không phải đụng ngày tháng. */
  function toView(r: TrialTableRow): TrialRowView {
    return {
      enrollmentId: r.enrollmentId,
      dateLabel: r.date ? capitalize(dateShortFmt.format(r.date)) : "",
      timeLabel: r.startTime && r.endTime ? `${r.startTime}–${r.endTime}` : "",
      trialClassName: r.trialClassName,
      studentLabel: r.birthYear ? `${r.studentName} - ${r.birthYear}` : r.studentName,
      parentName: r.parentName,
      courseName: r.courseName,
      status: r.status,
      evaluated: r.evaluated,
    };
  }

  // HV chưa gắn buổi không có ngày để xếp, nên KHÔNG trộn vào bảng "sắp Trial" (bảng đó
  // sắp theo ngày). Dồn xuống "Đã Trial" cũng sai — việc chưa xảy ra. Giữ nguyên khối
  // riêng như trước để không ai tàng hình.
  const upcoming = table.upcoming.map(toView);
  const done = table.done.map(toView);

  return (
    <div>
      <PageHeader
        title="Học viên Trial"
        subtitle={`Suất Trial trong ${TRIAL_WINDOW_DAYS} ngày tới và các suất đã học. Sau buổi, nhập phiếu đánh giá cho từng học viên.`}
      />

      <TrialList
        upcoming={upcoming}
        done={done}
        windowDays={TRIAL_WINDOW_DAYS}
      />
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
