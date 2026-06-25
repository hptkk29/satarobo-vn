import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { can, hasRole } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { scopedDb } from "@/lib/db-scope";
import { resolveActor } from "@/lib/auth/actor";
import type { Prisma, TrialClassStatus } from "@prisma/client";
import { TrialsList } from "./_components/trials-list";
import { TRIAL_STATUS_LABEL, ALL_TRIAL_STATUSES } from "@/lib/trials/status";

export const metadata = { title: "Học thử | Admin" };
export const dynamic = "force-dynamic";

// Trạng thái "kết thúc" — mặc định ẩn ở view "Đang xử lý" để bớt nhiễu.
const TRIAL_TERMINAL_STATUSES = [
  "ENROLLED",
  "REJECTED",
] as const satisfies readonly TrialClassStatus[];

interface Props {
  searchParams: Promise<{ status?: string }>;
}

export default async function TrialsPage({ searchParams }: Props) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!can(session.user, "trials:view")) redirect("/dashboard");

  const { status } = await searchParams;
  const isTeacher = hasRole(session.user, "TEACHER");
  const canManage = can(session.user, "trials:manage");

  // Luôn ẩn buổi học thử của lead đã xoá mềm (Lead.deletedAt != null).
  // Lead xoá là soft-delete → cascade onDelete không chạy → trial cũ vẫn còn → lọc ở đây.
  const where: Prisma.TrialClassWhereInput = { lead: { deletedAt: null } };
  if (status === "all") {
    // "Tất cả" — không lọc theo trạng thái (vẫn ẩn lead đã xoá mềm).
  } else if (status && (ALL_TRIAL_STATUSES as readonly string[]).includes(status)) {
    where.status = status as TrialClassStatus;
  } else {
    // Mặc định "Đang xử lý" — ẩn các trạng thái kết thúc (đỡ nhiễu).
    where.status = { notIn: [...TRIAL_TERMINAL_STATUSES] };
    // FL-R2 (item 6/TR-3): ẩn lead đã RỜI pipeline (đã ghi danh/mất/đăng ký/trùng) khỏi
    // danh sách học thử đang hoạt động — lịch sử vẫn giữ ở LeadTrialHistory (TR-4).
    where.lead = {
      deletedAt: null,
      status: { notIn: ["ENROLLED", "LOST", "REGISTERED", "DUPLICATE"] },
    };
  }
  // Teacher chỉ thấy buổi được phân công cho mình.
  if (isTeacher) where.teacherId = session.user.id;

  // Cách ly cơ sở: TrialClass/Room/Class đều thuộc SCOPED_MODELS (có centerId) → scopedDb
  // tự inject `centerId IN visible`. User/Course không scope (global) → giữ db trần.
  const actor = await resolveActor(session.user.id);
  const sdb = scopedDb(actor);

  // FL2-04 / US-LEAD-4: thay picker "lớp CHÍNH THỨC (Class)" SAI bằng lớp TRẢI NGHIỆM
  // (TrialClassV2 OPEN, cùng cơ sở). TrialClassV2 ∈ SCOPED_MODELS → sdb tự lọc cách ly cơ sở.
  const [trials, teachers, rooms, openTrialClassesRaw, courses] = await Promise.all([
    sdb.trialClass.findMany({
      where,
      orderBy: [{ status: "asc" }, { scheduledAt: "asc" }],
      take: 200,
      include: {
        lead: {
          select: {
            id: true,
            parentName: true,
            phone: true,
            childName: true,
            centerId: true,
            children: { select: { id: true, fullName: true, trialStatus: true } },
          },
        },
        center: { select: { name: true } },
        teacher: { select: { id: true, name: true } },
        feedback: true,
      },
    }),
    db.user.findMany({
      where: { roles: { has: "TEACHER" }, isActive: true, deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    sdb.room.findMany({
      where: { status: "ACTIVE" },
      select: { id: true, name: true, code: true },
      orderBy: { displayOrder: "asc" },
    }),
    can(session.user, "trials:manage")
      ? sdb.trialClassV2.findMany({
          where: { status: "OPEN" },
          orderBy: { startDate: "asc" },
          take: 100,
          select: {
            id: true,
            name: true,
            code: true,
            capacity: true,
            centerId: true,
            enrollments: { where: { status: "ACTIVE" }, select: { id: true } },
          },
        })
      : Promise.resolve([]),
    db.course.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const openTrialClasses = openTrialClassesRaw.map((cl) => ({
    id: cl.id,
    name: cl.name,
    code: cl.code,
    capacity: cl.capacity,
    centerId: cl.centerId,
    used: cl.enrollments.length,
  }));

  const items = trials.map((t) => ({
    id: t.id,
    leadId: t.lead.id,
    parentName: t.lead.parentName,
    phone: t.lead.phone,
    childName: t.lead.childName,
    centerName: t.center?.name ?? null,
    teacherId: t.teacherId,
    teacherName: t.teacher?.name ?? null,
    roomId: t.roomId,
    classId: t.classId,
    // FL2-04 — cơ sở hiệu lực để lọc lớp trải nghiệm cùng cơ sở (AC3): ưu tiên cơ sở
    // của buổi học thử, fallback cơ sở lead.
    effectiveCenterId: t.centerId ?? t.lead.centerId ?? null,
    children: t.lead.children.map((c) => ({
      id: c.id,
      fullName: c.fullName,
      trialStatus: c.trialStatus,
    })),
    scheduledAt: t.scheduledAt.toISOString(),
    status: t.status,
    notes: t.notes,
    feedback: t.feedback
      ? {
          childEnjoyed: t.feedback.childEnjoyed,
          childGrasp: t.feedback.childGrasp,
          teacherSuggestion: t.feedback.teacherSuggestion,
          parentFeedback: t.feedback.parentFeedback,
          recommendedCourseId: t.feedback.recommendedCourseId,
        }
      : null,
  }));

  return (
    <div className="max-w-6xl p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Học thử</h1>
        <p className="mt-1 text-sm text-gray-500">
          Lịch học thử tự sinh khi lead chuyển sang &quot;Đã hẹn học thử&quot;. Giáo
          viên nhập nhận xét sau buổi.
        </p>
      </div>

      <TrialsList
        items={items}
        teachers={teachers.map((u) => ({ id: u.id, name: u.name ?? "(chưa đặt tên)" }))}
        rooms={rooms.map((r) => ({ id: r.id, label: `${r.name} (${r.code})` }))}
        openTrialClasses={openTrialClasses}
        courses={courses}
        canManage={canManage}
        canOverride={can(session.user, "trials:override-capacity")}
        canFeedback={can(session.user, "trials:feedback")}
        statusFilter={status ?? ""}
        statusLabels={TRIAL_STATUS_LABEL}
      />
    </div>
  );
}
