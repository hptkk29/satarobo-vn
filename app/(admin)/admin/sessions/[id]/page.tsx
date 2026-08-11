import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft, CalendarDays } from "lucide-react";
import { auth } from "@/lib/auth";
import { resolveActor } from "@/lib/auth/actor";
import { scopedDb } from "@/lib/db-scope";
import { SessionFeedbackEditor } from "./_components/session-feedback-editor";
import { SessionChecklist } from "./_components/session-checklist";
import { canManageSessionClass } from "./_actions";
import { hasRole } from "@/lib/auth/permissions";
import { getPreSessionInfo } from "@/lib/lms/pre-session";
import { ENROLLMENT_ACTIVE_STATUS_LIST } from "@/lib/enrollment-status";
import { BookOpen, Users, AlertTriangle, FileWarning } from "lucide-react";

export const metadata = { title: "Chi tiết buổi học | Admin" };
export const dynamic = "force-dynamic";

const PRESENT_STATUSES = new Set(["PRESENT", "LATE"]);

interface Props {
  params: Promise<{ id: string }>;
}

export default async function SessionDetailPage({ params }: Props) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const { id } = await params;

  // Nhóm 01 L1 — ClassSession ∈ SCOPED_MODELS: sdb.findUnique lọc hậu kỳ theo
  // record.centerId → select PHẢI kèm centerId. Buổi ngoài tầm nhìn cơ sở → 404
  // (học bù liên cơ sở đi qua lib/makeup + trang điểm danh, không qua trang này).
  const actor = await resolveActor(session.user.id);
  const sdb = scopedDb(actor);

  const sess = await sdb.classSession.findUnique({
    where: { id },
    select: {
      id: true,
      centerId: true,
      date: true,
      topic: true,
      notes: true,
      lessonId: true,
      status: true,
      ckClean: true,
      ckEquipment: true,
      ckKit: true,
      ckLessonConfirmed: true,
      ckMedia: true,
      ckHomework: true,
      ckIncident: true,
      incidentNote: true,
      lessonNotes: true,
      lesson: { select: { title: true, order: true } },
      class: {
        select: {
          id: true,
          name: true,
          classCode: true,
          centerId: true,
          teacherId: true,
          assistantId: true,
          startTime: true,
          endTime: true,
          center: { select: { name: true } },
          room: { select: { code: true } },
          course: { select: { name: true } },
          teacher: { select: { name: true } },
        },
      },
      attendances: { select: { studentId: true, status: true } },
      studentFeedbacks: { select: { studentId: true, comment: true, rating: true } },
    },
  });
  if (!sess) notFound();

  const canEdit = await canManageSessionClass(
    { id: session.user.id, role: session.user.role, centerId: session.user.centerId },
    sess.class,
  );
  if (!canEdit && !hasRole(session.user, "HR")) {
    // HR có employees:view-all nhưng buổi học không thuộc phạm vi → chặn hẳn nếu không quản lý được.
    redirect("/sessions");
  }

  const enrollments = await sdb.enrollment.findMany({
    where: { classId: sess.class.id, status: { in: ENROLLMENT_ACTIVE_STATUS_LIST } },
    select: { student: { select: { id: true, name: true } } },
    orderBy: { student: { name: "asc" } },
  });

  const presentSet = new Set(
    sess.attendances.filter((a) => PRESENT_STATUSES.has(a.status)).map((a) => a.studentId),
  );
  const fbMap = new Map(sess.studentFeedbacks.map((f) => [f.studentId, f]));
  // FIX #6 — tick "đã nhận xét" phải KHỚP deriveSteps (_actions.ts): tính theo SỰ TỒN TẠI
  // phiếu (mọi HS present có row StudentSessionFeedback) — phiếu rubric-only (comment
  // null) vẫn là ĐÃ nhận xét. So "comment ≠ rỗng" như cũ làm tick lệch với server.
  const fbStudentIds = new Set(sess.studentFeedbacks.map((f) => f.studentId));
  const ckFeedbackDerived =
    presentSet.size > 0 && [...presentSet].every((id) => fbStudentIds.has(id));

  const studentRows = enrollments.map((e) => {
    const fb = fbMap.get(e.student.id);
    return {
      studentId: e.student.id,
      name: e.student.name,
      present: presentSet.has(e.student.id),
      comment: fb?.comment ?? "",
      rating: fb?.rating ?? null,
    };
  });

  const dateStr = new Date(sess.date).toLocaleDateString("vi-VN", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  // LMS-4 — thông tin chuẩn bị (chỉ khi buổi chưa hoàn tất).
  const pre = sess.status !== "COMPLETED" ? await getPreSessionInfo(sess.id) : null;

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <Link href="/sessions" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-4 w-4" /> Danh sách buổi học
        </Link>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
          <CalendarDays className="h-6 w-6 text-primary" />
          {sess.class.classCode ? `${sess.class.classCode} · ` : ""}{sess.class.name}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {dateStr}
          {sess.class.startTime && sess.class.endTime ? ` · ${sess.class.startTime}–${sess.class.endTime}` : ""}
          {sess.class.center?.name ? ` · ${sess.class.center.name}` : ""}
          {sess.class.room?.code ? ` · P.${sess.class.room.code}` : ""}
        </p>
      </div>

      <section className="rounded-xl border border-border bg-card p-5">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
          <Info label="Khoá" value={sess.class.course.name} />
          <Info label="GV chính" value={sess.class.teacher?.name ?? "—"} />
          <Info label="Bài học" value={sess.lesson ? `Bài ${sess.lesson.order}: ${sess.lesson.title}` : (sess.topic ?? "—")} />
        </dl>
        {sess.notes && <p className="mt-3 text-sm text-muted-foreground">Ghi chú: {sess.notes}</p>}
      </section>

      {/* LMS-4 — chuẩn bị trước buổi học */}
      {pre && (
        <section className="rounded-xl border border-state-info-soft bg-state-info-soft/40 p-5">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-state-info-ink">
            Chuẩn bị trước buổi học
          </h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="rounded-lg border border-state-info-soft bg-card p-3">
              <div className="mb-1 flex items-center gap-1.5 text-xs font-bold text-muted-foreground">
                <BookOpen className="h-4 w-4" /> BÀI DỰ KIẾN
              </div>
              {pre.expectedLesson ? (
                <>
                  <p className="text-sm font-semibold text-foreground">
                    Bài {pre.expectedLesson.order}: {pre.expectedLesson.title}
                    {pre.expectedIsSuggested && (
                      <span className="ml-1 text-xs font-normal text-state-info-ink">(gợi ý)</span>
                    )}
                  </p>
                  {pre.expectedLesson.materials.length > 0 && (
                    <div className="mt-1 text-xs text-muted-foreground">
                      Thiết bị: {pre.expectedLesson.materials.join(", ")}
                    </div>
                  )}
                </>
              ) : (
                <p className="text-sm text-muted-foreground">Chưa có giáo trình cho khoá.</p>
              )}
            </div>

            <div className="rounded-lg border border-state-info-soft bg-card p-3">
              <div className="mb-1 flex items-center gap-1.5 text-xs font-bold text-muted-foreground">
                <Users className="h-4 w-4" /> HỌC SINH ({pre.students.length})
              </div>
              <p className="text-sm text-foreground">
                {pre.students.map((s) => s.name).join(", ") || "—"}
              </p>
            </div>

            <div className="rounded-lg border border-state-warning-soft bg-card p-3">
              <div className="mb-1 flex items-center gap-1.5 text-xs font-bold text-state-warning-ink">
                <AlertTriangle className="h-4 w-4" /> CẦN LƯU Ý
              </div>
              {pre.studentsToNote.length === 0 ? (
                <p className="text-sm text-muted-foreground">Không có.</p>
              ) : (
                <ul className="space-y-0.5 text-sm text-foreground">
                  {pre.studentsToNote.map((s) => (
                    <li key={s.id}>
                      <span className="font-medium">{s.name}</span> — {s.reasons.join("; ")}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="rounded-lg border border-state-danger-soft bg-card p-3">
              <div className="mb-1 flex items-center gap-1.5 text-xs font-bold text-state-danger-ink">
                <FileWarning className="h-4 w-4" /> BÀI TẬP CHƯA CHẤM ({pre.ungraded.length})
              </div>
              {pre.ungraded.length === 0 ? (
                <p className="text-sm text-muted-foreground">Đã chấm hết.</p>
              ) : (
                <ul className="space-y-0.5 text-sm text-foreground">
                  {pre.ungraded.slice(0, 8).map((u, i) => (
                    <li key={i}>
                      {u.studentName} · <span className="text-muted-foreground">{u.assignmentTitle}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </section>
      )}

      {/* LMS-3 — checklist sau buổi */}
      <SessionChecklist
        sessionId={sess.id}
        status={sess.status}
        lessonLinked={!!sess.lessonId}
        derived={{
          ckAttendance: sess.attendances.length > 0,
          ckFeedback: ckFeedbackDerived,
        }}
        stored={{
          ckClean: sess.ckClean,
          ckEquipment: sess.ckEquipment,
          ckKit: sess.ckKit,
          ckLessonConfirmed: sess.ckLessonConfirmed,
          ckMedia: sess.ckMedia,
          ckHomework: sess.ckHomework,
          ckIncident: sess.ckIncident,
          incidentNote: sess.incidentNote ?? "",
          lessonNotes: sess.lessonNotes ?? "",
        }}
        canEdit={canEdit}
      />

      {/* LMS-2 — nhận xét từng học sinh */}
      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="mb-4 text-sm font-bold uppercase tracking-wider text-muted-foreground">
          Nhận xét từng học sinh
        </h2>
        <SessionFeedbackEditor sessionId={sess.id} students={studentRows} canEdit={canEdit} />
      </section>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 break-words text-foreground">{value}</dd>
    </div>
  );
}
