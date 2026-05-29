import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft, CalendarDays } from "lucide-react";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { SessionFeedbackEditor } from "./_components/session-feedback-editor";
import { SessionChecklist } from "./_components/session-checklist";
import { canManageSessionClass } from "./_actions";
import { getPreSessionInfo } from "@/lib/lms/pre-session";
import { BookOpen, Users, AlertTriangle, FileWarning } from "lucide-react";

export const metadata = { title: "Chi tiết buổi học | Admin" };
export const dynamic = "force-dynamic";

const ACTIVE_ENROLL = ["PENDING", "CONFIRMED", "STUDYING", "ACTIVE"] as const;
const PRESENT_STATUSES = new Set(["PRESENT", "LATE"]);

interface Props {
  params: Promise<{ id: string }>;
}

export default async function SessionDetailPage({ params }: Props) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const { id } = await params;

  const sess = await db.classSession.findUnique({
    where: { id },
    select: {
      id: true,
      date: true,
      topic: true,
      notes: true,
      lessonId: true,
      status: true,
      ckLessonConfirmed: true,
      ckMedia: true,
      ckHomework: true,
      ckIncident: true,
      incidentNote: true,
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
  if (!canEdit && session.user.role !== "HR") {
    // HR có employees:view-all nhưng buổi học không thuộc phạm vi → chặn hẳn nếu không quản lý được.
    redirect("/sessions");
  }

  const enrollments = await db.enrollment.findMany({
    where: { classId: sess.class.id, status: { in: [...ACTIVE_ENROLL] } },
    select: { student: { select: { id: true, name: true } } },
    orderBy: { student: { name: "asc" } },
  });

  const presentSet = new Set(
    sess.attendances.filter((a) => PRESENT_STATUSES.has(a.status)).map((a) => a.studentId),
  );
  const fbMap = new Map(sess.studentFeedbacks.map((f) => [f.studentId, f]));

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
        <Link href="/sessions" className="mb-3 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
          <ChevronLeft className="h-4 w-4" /> Danh sách buổi học
        </Link>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
          <CalendarDays className="h-6 w-6 text-[#7C3AED]" />
          {sess.class.classCode ? `${sess.class.classCode} · ` : ""}{sess.class.name}
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          {dateStr}
          {sess.class.startTime && sess.class.endTime ? ` · ${sess.class.startTime}–${sess.class.endTime}` : ""}
          {sess.class.center?.name ? ` · ${sess.class.center.name}` : ""}
          {sess.class.room?.code ? ` · P.${sess.class.room.code}` : ""}
        </p>
      </div>

      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
          <Info label="Khoá" value={sess.class.course.name} />
          <Info label="GV chính" value={sess.class.teacher?.name ?? "—"} />
          <Info label="Bài học" value={sess.lesson ? `Bài ${sess.lesson.order}: ${sess.lesson.title}` : (sess.topic ?? "—")} />
        </dl>
        {sess.notes && <p className="mt-3 text-sm text-gray-600">Ghi chú: {sess.notes}</p>}
      </section>

      {/* LMS-4 — chuẩn bị trước buổi học */}
      {pre && (
        <section className="rounded-xl border border-indigo-200 bg-indigo-50/40 p-5">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-indigo-700">
            Chuẩn bị trước buổi học
          </h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="rounded-lg border border-indigo-100 bg-white p-3">
              <div className="mb-1 flex items-center gap-1.5 text-xs font-bold text-gray-500">
                <BookOpen className="h-4 w-4" /> BÀI DỰ KIẾN
              </div>
              {pre.expectedLesson ? (
                <>
                  <p className="text-sm font-semibold text-gray-900">
                    Bài {pre.expectedLesson.order}: {pre.expectedLesson.title}
                    {pre.expectedIsSuggested && (
                      <span className="ml-1 text-xs font-normal text-indigo-500">(gợi ý)</span>
                    )}
                  </p>
                  {pre.expectedLesson.materials.length > 0 && (
                    <div className="mt-1 text-xs text-gray-600">
                      Thiết bị: {pre.expectedLesson.materials.join(", ")}
                    </div>
                  )}
                </>
              ) : (
                <p className="text-sm text-gray-400">Chưa có giáo trình cho khoá.</p>
              )}
            </div>

            <div className="rounded-lg border border-indigo-100 bg-white p-3">
              <div className="mb-1 flex items-center gap-1.5 text-xs font-bold text-gray-500">
                <Users className="h-4 w-4" /> HỌC SINH ({pre.students.length})
              </div>
              <p className="text-sm text-gray-700">
                {pre.students.map((s) => s.name).join(", ") || "—"}
              </p>
            </div>

            <div className="rounded-lg border border-amber-100 bg-white p-3">
              <div className="mb-1 flex items-center gap-1.5 text-xs font-bold text-amber-600">
                <AlertTriangle className="h-4 w-4" /> CẦN LƯU Ý
              </div>
              {pre.studentsToNote.length === 0 ? (
                <p className="text-sm text-gray-400">Không có.</p>
              ) : (
                <ul className="space-y-0.5 text-sm text-gray-700">
                  {pre.studentsToNote.map((s) => (
                    <li key={s.id}>
                      <span className="font-medium">{s.name}</span> — {s.reasons.join("; ")}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="rounded-lg border border-rose-100 bg-white p-3">
              <div className="mb-1 flex items-center gap-1.5 text-xs font-bold text-rose-600">
                <FileWarning className="h-4 w-4" /> BÀI TẬP CHƯA CHẤM ({pre.ungraded.length})
              </div>
              {pre.ungraded.length === 0 ? (
                <p className="text-sm text-gray-400">Đã chấm hết.</p>
              ) : (
                <ul className="space-y-0.5 text-sm text-gray-700">
                  {pre.ungraded.slice(0, 8).map((u, i) => (
                    <li key={i}>
                      {u.studentName} · <span className="text-gray-500">{u.assignmentTitle}</span>
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
          ckFeedback:
            studentRows.filter((s) => s.present).length > 0 &&
            studentRows.filter((s) => s.present).every((s) => s.comment.trim().length > 0),
        }}
        stored={{
          ckLessonConfirmed: sess.ckLessonConfirmed,
          ckMedia: sess.ckMedia,
          ckHomework: sess.ckHomework,
          ckIncident: sess.ckIncident,
          incidentNote: sess.incidentNote ?? "",
        }}
        canEdit={canEdit}
      />

      {/* LMS-2 — nhận xét từng học sinh */}
      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="mb-4 text-sm font-bold uppercase tracking-wider text-gray-500">
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
      <dt className="text-xs font-semibold uppercase tracking-wide text-gray-400">{label}</dt>
      <dd className="mt-0.5 break-words text-gray-800">{value}</dd>
    </div>
  );
}
