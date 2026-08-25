// app/(admin)/admin/lop-trial/[id]/page.tsx — GĐ2. Chi tiết một lớp trải nghiệm.
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/auth/check-permission";
import { resolveActor } from "@/lib/auth/actor";
import { getAssignableTeachers } from "@/lib/teachers/assignable";
import { TrialSessionEvalFill } from "@/app/(admin)/admin/evaluations/_components/trial-session-eval-fill";
import { layChiTietLop } from "../_lib/queries";
import { TeacherAssignSelect } from "../_components/teacher-assign-select";
import { AddSessionForm } from "../_components/add-session-form";
import { EnrollPanel } from "../_components/enroll-panel";
import { RosterList } from "../_components/roster-list";
import { AttendanceBoard } from "../_components/attendance-board";
import { CancelClassButton } from "../_components/cancel-class-button";

export const dynamic = "force-dynamic";

const NHAN_TRANG_THAI: Record<string, string> = {
  OPEN: "Đang mở",
  RUNNING: "Đang chạy",
  COMPLETED: "Đã xong",
  CANCELLED: "Đã huỷ",
};
const MAU_TRANG_THAI: Record<string, string> = {
  OPEN: "bg-emerald-100 text-emerald-700",
  RUNNING: "bg-blue-100 text-blue-700",
  COMPLETED: "bg-gray-200 text-gray-600",
  CANCELLED: "bg-red-100 text-red-700",
};

export default async function ChiTietLopTrialPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!(await checkPermission("trials:view"))) redirect("/dashboard");

  const { id } = await params;
  const actor = await resolveActor(session.user.id);
  const cls = await layChiTietLop(actor, id);
  // layChiTietLop đã lọc theo scopedDb → ngoài cơ sở là 404, không phải "cấm truy cập".
  if (!cls) notFound();

  const [canAssignTeacher, isManager, canFeedback] = await Promise.all([
    checkPermission("trials:assign-teacher", { centerId: cls.centerId }),
    checkPermission("trials:manage", { centerId: cls.centerId }),
    checkPermission("trials:feedback", { centerId: cls.centerId }),
  ]);
  // Giáo viên thuần chỉ điểm danh lớp mình; người quản lý điểm danh mọi lớp trong tầm nhìn.
  const canMark = canFeedback && (isManager || cls.teacherId === session.user.id);

  // Chỉ nạp danh sách GV khi có quyền gán. `includeIds` giữ GV đang gán để <select>
  // không tự rớt giá trị đang chọn khi người đó không còn khớp bộ lọc.
  const teachers = canAssignTeacher
    ? await getAssignableTeachers({
        centerIds: [cls.centerId],
        includeIds: [cls.teacherId],
      })
    : [];
  const teacherOptions = teachers.map((t) => ({ id: t.id, name: t.name ?? "(không tên)" }));

  // GĐ3 — danh sách GV cho ô đề xuất/phân công của TỪNG CA. Khác `teacherOptions` ở
  // trên: ô kia chỉ nạp khi có quyền gán lớp, còn Sale (chỉ có trials:manage) vẫn
  // phải chọn được người để ĐỀ XUẤT. Nạp riêng khi một trong hai quyền có mặt.
  const teacherOptionsChoCa =
    isManager || canAssignTeacher
      ? (
          await getAssignableTeachers({
            centerIds: [cls.centerId],
            includeIds: cls.enrollments.flatMap((e) => [e.gvDeXuatId, e.gvPhanCongId]),
          })
        ).map((t) => ({ id: t.id, name: t.name ?? "(không tên)" }))
      : [];

  const activeUsed = cls.enrollments.filter((e) => e.status === "ACTIVE").length;
  const full = activeUsed >= cls.capacity;
  const daKetThuc = cls.status === "COMPLETED" || cls.status === "CANCELLED";

  // Phiếu đánh giá buổi học dùng LẠI component của màn Đánh giá — cố ý không fork:
  // fork là đẻ ra hai nguồn sự thật cho cùng một phiếu.
  const evalStudents = cls.enrollments
    .filter((e) => e.status === "ACTIVE" || e.status === "COMPLETED")
    .map((e) => ({
      studentId: e.leadChildId ?? e.id,
      name: e.childName,
      present: true,
    }));
  const evalSessions = cls.sessions.map((s) => ({ id: s.id, label: `Buổi ${s.seq}` }));

  return (
    <div className="space-y-5">
      <Link
        href="/lop-trial"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" /> Quay lại danh sách
      </Link>

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-bold text-foreground">{cls.name}</h2>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                MAU_TRANG_THAI[cls.status] ?? "bg-gray-100 text-gray-600"
              }`}
            >
              {NHAN_TRANG_THAI[cls.status] ?? cls.status}
            </span>
          </div>
          <p className="mt-1 font-mono text-xs text-muted-foreground">{cls.code}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {cls.startTime}–{cls.endTime} · Sĩ số{" "}
            <span className={full ? "font-semibold text-red-600" : "font-semibold"}>
              {activeUsed}/{cls.capacity}
            </span>{" "}
            · {cls.sessionCount} buổi
            {cls.configName ? ` (${cls.configName})` : ""}
          </p>
        </div>
        {isManager && !daKetThuc && <CancelClassButton trialClassId={cls.id} />}
      </div>

      {full && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Lớp đã đủ sĩ số. Xếp thêm học viên cần quyền vượt sĩ số.
        </p>
      )}

      <section className="rounded-xl border border-border bg-card p-4">
        <TeacherAssignSelect
          trialClassId={cls.id}
          teacherId={cls.teacherId}
          teachers={teacherOptions}
          canAssign={canAssignTeacher}
        />
      </section>

      {isManager && (
        <section className="rounded-xl border border-border bg-card p-4">
          <h3 className="mb-3 text-sm font-semibold text-foreground">Thêm buổi học</h3>
          <AddSessionForm
            trialClassId={cls.id}
            teachers={teacherOptions}
            defaultStartTime={cls.startTime}
            defaultEndTime={cls.endTime}
          />
        </section>
      )}

      {cls.sessions.length === 0 && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Lớp chưa có buổi nào. Phải thêm buổi trước, vì chưa có buổi thì không xếp được
          học viên và giáo viên cũng không thấy gì để điểm danh.
        </p>
      )}

      <section className="rounded-xl border border-border bg-card p-4">
        <h3 className="mb-3 text-sm font-semibold text-foreground">Học viên</h3>
        <EnrollPanel
          trialClassId={cls.id}
          sessions={cls.sessions}
          canManage={isManager}
          canOverride={await checkPermission("trials:override-capacity", {
            centerId: cls.centerId,
          })}
          full={full}
        />
        <div className="mt-3">
          <RosterList
            trialClassId={cls.id}
            enrollments={cls.enrollments}
            sessions={cls.sessions}
            teachers={teacherOptionsChoCa}
            canManage={isManager}
            canAssignTeacher={canAssignTeacher}
          />
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card p-4">
        <h3 className="mb-3 text-sm font-semibold text-foreground">Buổi học &amp; điểm danh</h3>
        <AttendanceBoard
          sessions={cls.sessions}
          enrollments={cls.enrollments}
          canMark={canMark}
        />
      </section>

      {evalSessions.length > 0 && evalStudents.length > 0 && (
        <section className="rounded-xl border border-border bg-card p-4">
          <h3 className="mb-3 text-sm font-semibold text-foreground">
            Phiếu đánh giá buổi học
          </h3>
          <TrialSessionEvalFill
            trialSessions={evalSessions}
            students={evalStudents}
            canEdit={canMark}
          />
        </section>
      )}
    </div>
  );
}
