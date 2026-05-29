import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/auth/permissions";
import { TeacherProfileForm } from "./_components/profile-form";

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

  const courses = await db.course.findMany({
    where: { isActive: true },
    orderBy: { displayOrder: "asc" },
    select: { id: true, name: true, code: true },
  });

  const p = teacher.teacherProfile;

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
          courseIds: p?.teachableCourses.map((t) => t.courseId) ?? [],
        }}
      />
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
