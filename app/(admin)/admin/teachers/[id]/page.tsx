import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/auth/permissions";
import { TeacherProfileForm } from "./_components/profile-form";
import { ClassAssignmentSection } from "./_components/class-assignment";
import { WeeklySchedule } from "./_components/weekly-schedule";
import type { TeacherClassSlot } from "@/lib/teachers/schedule";
import { computeTeachingLoad, OVERLOAD_HOURS_PER_WEEK } from "@/lib/teachers/load";

export const metadata = { title: "Hồ sơ giáo viên | Admin" };
export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function TeacherProfilePage({ params }: Props) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const { id } = await params;

  const teacher = await db.user.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      centerId: true,
      center: { select: { name: true } },
      employee: { select: { employeeCode: true, jobTitle: true, phone: true } },
      teacherProfile: {
        select: {
          rank: true,
          employmentType: true,
          status: true,
          bio: true,
          teachableCourses: { select: { courseId: true } },
        },
      },
    },
  });
  if (!teacher || teacher.role !== "TEACHER") notFound();

  const me = session.user;
  const isOwn = me.id === id;
  const cmInScope = me.role === "CENTER_MANAGER" && teacher.centerId === me.centerId;
  // Xem: SUPER_ADMIN/HR (employees:view-all & không phải CM), CM cùng cơ sở, hoặc GV xem chính mình.
  const canViewByRole =
    can(me, "employees:view-all") &&
    (me.role !== "CENTER_MANAGER" || cmInScope);
  const canView = isOwn || canViewByRole;
  if (!canView) redirect("/dashboard");
  // Sửa: SUPER_ADMIN, hoặc CM cùng cơ sở.
  const canEdit = me.role === "SUPER_ADMIN" || cmInScope;

  const p = teacher.teacherProfile;
  const teacherCourseIds = p?.teachableCourses.map((t) => t.courseId) ?? [];

  const classSelect = {
    id: true,
    name: true,
    classCode: true,
    courseId: true,
    course: { select: { name: true } },
    scheduleDays: true,
    startTime: true,
    endTime: true,
  } as const;

  const [courses, mainClasses, assistantClasses, assignableRaw] = await Promise.all([
    db.course.findMany({
      where: { isActive: true },
      orderBy: { displayOrder: "asc" },
      select: { id: true, name: true, code: true },
    }),
    db.class.findMany({
      where: { teacherId: id, deletedAt: null },
      orderBy: { name: "asc" },
      select: classSelect,
    }),
    db.class.findMany({
      where: { assistantId: id, deletedAt: null },
      orderBy: { name: "asc" },
      select: classSelect,
    }),
    db.class.findMany({
      where: {
        deletedAt: null,
        status: { in: ["PLANNED", "RECRUITING", "ACTIVE"] },
        teacherId: { not: id },
        ...(teacher.centerId ? { centerId: teacher.centerId } : {}),
      },
      orderBy: { name: "asc" },
      take: 200,
      select: classSelect,
    }),
  ]);

  const fmtClass = (c: { id: string; name: string; classCode: string | null; course: { name: string } }) => ({
    id: c.id,
    label: c.classCode ? `${c.classCode} · ${c.name}` : c.name,
    courseName: c.course.name,
  });

  // Lịch tuần = GV chính + trợ giảng (đều chiếm chỗ → tính trùng giờ).
  const scheduleSlots: TeacherClassSlot[] = [
    ...mainClasses.map((c) => ({
      id: c.id,
      label: c.classCode ? `${c.classCode} · ${c.name}` : c.name,
      scheduleDays: c.scheduleDays,
      startTime: c.startTime,
      endTime: c.endTime,
      role: "teacher" as const,
    })),
    ...assistantClasses.map((c) => ({
      id: c.id,
      label: c.classCode ? `${c.classCode} · ${c.name}` : c.name,
      scheduleDays: c.scheduleDays,
      startTime: c.startTime,
      endTime: c.endTime,
      role: "assistant" as const,
    })),
  ];

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <Link href="/teachers" className="mb-3 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
          <ChevronLeft className="h-4 w-4" /> Danh sách giáo viên
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold text-gray-900">{teacher.name ?? teacher.email}</h1>
          {!canEdit && (
            <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-500">
              Chỉ xem
            </span>
          )}
        </div>
      </div>

      {/* Thông tin cơ bản */}
      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-gray-500">
          Thông tin cơ bản
        </h2>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
          <Info label="Email" value={teacher.email} />
          <Info label="Mã NV" value={teacher.employee?.employeeCode ?? "—"} />
          <Info label="Chức danh" value={teacher.employee?.jobTitle ?? "—"} />
          <Info label="SĐT" value={teacher.employee?.phone ?? "—"} />
          <Info label="Cơ sở" value={teacher.center?.name ?? "—"} />
        </dl>
      </section>

      <TeacherProfileForm
        userId={teacher.id}
        canEdit={canEdit}
        courses={courses.map((c) => ({
          id: c.id,
          label: c.code ? `${c.code} · ${c.name}` : c.name,
        }))}
        initial={{
          rank: p?.rank ?? "TRAINEE",
          employmentType: p?.employmentType ?? "PARTTIME",
          status: p?.status ?? "ACTIVE",
          bio: p?.bio ?? "",
          courseIds: teacherCourseIds,
        }}
      />

      <ClassAssignmentSection
        teacherUserId={teacher.id}
        teacherCourseIds={teacherCourseIds}
        canEdit={canEdit}
        mainClasses={mainClasses.map(fmtClass)}
        assistantClasses={assistantClasses.map(fmtClass)}
        assignable={assignableRaw.map((c) => ({
          id: c.id,
          label: c.classCode ? `${c.classCode} · ${c.name}` : c.name,
          courseId: c.courseId,
          courseName: c.course.name,
        }))}
      />

      <WeeklySchedule slots={scheduleSlots} />

      {/* PHẦN 4 — Tải giảng dạy (tính từ lớp GV chính phụ trách) */}
      {(() => {
        const load = computeTeachingLoad(
          mainClasses.map((c) => ({
            scheduleDays: c.scheduleDays,
            startTime: c.startTime,
            endTime: c.endTime,
          })),
        );
        return (
          <section className="rounded-xl border border-gray-200 bg-white p-5">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-sm font-bold uppercase tracking-wider text-gray-500">
                Tải giảng dạy / tuần
              </h2>
              {load.overloaded && (
                <span className="rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-semibold text-rose-700">
                  Quá tải (&gt; {OVERLOAD_HOURS_PER_WEEK}h/tuần)
                </span>
              )}
            </div>
            <dl className="grid grid-cols-3 gap-3 text-center">
              <Stat label="Lớp đang dạy" value={String(load.classCount)} />
              <Stat label="Buổi / tuần" value={String(load.sessionsPerWeek)} />
              <Stat label="Giờ / tuần" value={`${load.hoursPerWeek}h`} />
            </dl>
          </section>
        );
      })()}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-gray-50 p-3">
      <div className="text-2xl font-bold text-gray-900 tabular-nums">{value}</div>
      <div className="mt-0.5 text-xs text-gray-500">{label}</div>
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
