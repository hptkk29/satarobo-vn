import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft, AlertTriangle } from "lucide-react";
import { auth } from "@/lib/auth";
import { can } from "@/lib/auth/permissions";
import { resolveActor } from "@/lib/auth/actor";
import { scopedDb, passesScope } from "@/lib/db-scope";
import { getAssignableTeachers } from "@/lib/teachers/assignable";
import { TrialClassDetail } from "../_components/trial-class-detail";
import { TrialSessionEvalFill } from "@/app/(admin)/admin/evaluations/_components/trial-session-eval-fill";

export const metadata = { title: "Chi tiết lớp trải nghiệm | Admin" };
export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  OPEN: "Đang mở",
  RUNNING: "Đang chạy",
  COMPLETED: "Hoàn tất",
  CANCELLED: "Đã huỷ",
};
const STATUS_BADGE: Record<string, string> = {
  OPEN: "bg-emerald-100 text-emerald-700",
  RUNNING: "bg-blue-100 text-blue-700",
  COMPLETED: "bg-gray-100 text-gray-600",
  CANCELLED: "bg-rose-100 text-rose-700",
};

interface Props {
  params: Promise<{ id: string }>;
}

export default async function TrialClassDetailPage({ params }: Props) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!can(session.user, "trials:view")) redirect("/dashboard");

  const { id } = await params;
  const actor = await resolveActor(session.user.id);
  const sdb = scopedDb(actor);

  const cls = await sdb.trialClassV2.findUnique({
    where: { id },
    include: {
      config: { select: { name: true, sessionCount: true } },
      sessions: {
        orderBy: { seq: "asc" },
        include: {
          attendances: {
            select: { trialEnrollmentId: true, status: true, note: true },
          },
        },
      },
      enrollments: {
        orderBy: { createdAt: "asc" },
        include: {
          leadChild: {
            select: {
              id: true,
              fullName: true,
              lead: { select: { id: true, parentName: true, phone: true } },
            },
          },
        },
      },
    },
  });
  // findUnique đã lọc IDOR, kèm passesScope cho chắc.
  if (!cls || !passesScope("TrialClassV2", cls, actor)) notFound();

  // GV phụ trách (teacherId là userId, không có FK relation trong schema).
  const teacherIds = [cls.teacherId].filter((x): x is string => Boolean(x));
  const teacherUsers = teacherIds.length
    ? await sdb.user.findMany({
        where: { id: { in: teacherIds } },
        select: { id: true, name: true },
      })
    : [];
  const teacherName = teacherUsers.find((u) => u.id === cls.teacherId)?.name ?? null;

  const canAssignTeacher = can(session.user, "trials:assign-teacher");
  const isManager = can(session.user, "trials:manage");
  // GV thuần chỉ điểm danh lớp của mình; QL điểm danh mọi lớp trong scope.
  const canMark =
    can(session.user, "trials:feedback") &&
    (isManager || cls.teacherId === session.user.id);

  // Danh sách GV để gán (chỉ load khi có quyền gán). Dùng nguồn DUY NHẤT
  // getAssignableTeachers; includeIds giữ GV đang gán dù dữ liệu không còn match
  // điều kiện → <Select> không tự rớt giá trị đang chọn.
  // R2-RBAC-3 — lớp trải nghiệm có cơ sở cố định → chỉ GV cùng cơ sở (cls.centerId)
  // + LUÔN kèm GV đang gán (includeIds) để <Select> không rớt value.
  const teacherOptions = canAssignTeacher
    ? await getAssignableTeachers({
        centerIds: cls.centerId ? [cls.centerId] : actor.visibleCenterIds,
        includeIds: [cls.teacherId],
      })
    : [];

  const activeUsed = cls.enrollments.filter((e) => e.status === "ACTIVE").length;
  const full = activeUsed >= cls.capacity;

  const enrollments = cls.enrollments.map((e) => ({
    id: e.id,
    leadChildId: e.leadChild?.id ?? null,
    childName: e.leadChild?.fullName ?? "(không rõ)",
    parentName: e.leadChild?.lead?.parentName ?? null,
    phone: e.leadChild?.lead?.phone ?? null,
    leadId: e.leadChild?.lead?.id ?? null,
    status: e.status,
  }));

  const sessions = cls.sessions.map((s) => ({
    id: s.id,
    seq: s.seq,
    date: s.date.toISOString(),
    startTime: s.startTime,
    endTime: s.endTime,
    status: s.status,
    attendance: Object.fromEntries(
      s.attendances.map((a) => [
        a.trialEnrollmentId,
        { status: a.status as "PRESENT" | "ABSENT", note: a.note },
      ]),
    ),
  }));

  // FL4 (R4) — phiếu đánh giá buổi học cho lớp trải nghiệm: HS = LeadChild đang/đã học.
  // studentId lưu = leadChild.id (EvalResponse.studentId là ref phẳng — trial dùng trialClassSessionId).
  const evalStudents = cls.enrollments
    .filter((e) => e.status === "ACTIVE" || e.status === "COMPLETED")
    .map((e) => ({
      studentId: e.leadChild?.id ?? e.id,
      name: e.leadChild?.fullName ?? "(không rõ)",
      present: true,
    }));
  const evalSessions = cls.sessions.map((s) => ({ id: s.id, label: `Buổi ${s.seq}` }));

  return (
    <div className="max-w-5xl p-6">
      <Link
        href="/trial-classes"
        className="mb-4 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
      >
        <ChevronLeft className="h-4 w-4" /> Quay lại danh sách
      </Link>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-3 border-b border-gray-200 pb-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold text-gray-900">{cls.name}</h1>
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                STATUS_BADGE[cls.status] ?? "bg-gray-100 text-gray-600"
              }`}
            >
              {STATUS_LABEL[cls.status] ?? cls.status}
            </span>
          </div>
          <div className="mt-1 text-sm text-gray-600">
            {cls.code}
            {cls.startDate ? ` · ${cls.startDate.toLocaleDateString("vi-VN")}` : ""} ·{" "}
            {cls.startTime}–{cls.endTime} · {cls.sessionCount} buổi
          </div>
          <div className="mt-1 text-sm text-gray-500">
            GV phụ trách: {teacherName ?? "Chưa phân công"}
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs uppercase tracking-wide text-gray-400">Sĩ số</div>
          <div
            className={`text-lg font-bold ${full ? "text-rose-600" : "text-gray-900"}`}
          >
            {activeUsed}/{cls.capacity}
          </div>
        </div>
      </div>

      {full && (
        <div className="mb-6 flex items-center gap-2 rounded-xl border border-rose-300 bg-rose-50 p-3 text-sm text-rose-700">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          Lớp đã đủ/vượt sĩ số. Cần quyền &quot;vượt sĩ số&quot; (QL) để xếp thêm.
        </div>
      )}

      <TrialClassDetail
        trialClassId={cls.id}
        currentTeacherId={cls.teacherId}
        classSessionCount={cls.sessionCount}
        enrollments={enrollments}
        sessions={sessions}
        teacherOptions={teacherOptions.map((t) => ({
          id: t.id,
          name: t.name ?? "(chưa đặt tên)",
        }))}
        canAssignTeacher={canAssignTeacher}
        canManage={isManager}
        canOverride={can(session.user, "trials:override-capacity")}
        canMark={canMark}
      />

      {evalSessions.length > 0 && evalStudents.length > 0 && (
        <section className="mt-6 rounded-xl border border-gray-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold text-gray-700">Phiếu đánh giá buổi học</h2>
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
