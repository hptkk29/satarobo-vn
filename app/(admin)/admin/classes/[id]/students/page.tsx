import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/auth/check-permission";
import { resolveActor } from "@/lib/auth/actor";
import { scopedDb, passesScope } from "@/lib/db-scope";
import {
  buildAssignableWhere,
  CAPACITY_COUNT_STATUSES,
} from "@/lib/lms/assign";
import { getAssignableSales } from "@/lib/sales/assignable";
import { AssignStudents } from "./_components/assign-students";

interface Props {
  params: Promise<{ id: string }>;
}

export const dynamic = "force-dynamic";

// Nhãn khớp màn /enrollments (trước đây STUDYING ghi "Đã xếp lớp" gây hiểu nhầm
// với nút "Chuyển sang Đang học").
const STATUS_LABEL: Record<string, string> = {
  PENDING: "Chờ xếp",
  CONFIRMED: "Đã xếp",
  STUDYING: "Đang học",
  ACTIVE: "Đang học (legacy)",
  PAUSED: "Bảo lưu",
};

export default async function ClassStudentsPage({ params }: Props) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!(await checkPermission("classes:edit"))) {
    redirect("/dashboard?error=unauthorized");
  }

  const { id } = await params;
  const actor = await resolveActor(session.user.id);
  const sdb = scopedDb(actor);

  const cls = await sdb.class.findFirst({
    where: { id, deletedAt: null },
    select: {
      id: true,
      name: true,
      courseId: true,
      centerId: true,
      maxStudents: true,
      status: true,
    },
  });
  if (!cls || !passesScope("Class", { centerId: cls.centerId }, actor)) notFound();

  const [current, assignable] = await Promise.all([
    sdb.enrollment.findMany({
      // student.deletedAt: hàng rào 2 cho dữ liệu hỏng trước 07/08 (HV xoá mềm nhưng
      // ghi danh còn sống) — đây chính là màn "Học sinh lớp" đã hiện HV ma.
      where: {
        classId: cls.id,
        status: { in: [...CAPACITY_COUNT_STATUSES, "PAUSED"] },
        student: { deletedAt: null },
      },
      orderBy: { enrolledAt: "asc" },
      select: {
        id: true,
        status: true,
        saleId: true, // T3.2 — sale phụ trách hiển thị/sửa ngay trong lớp
        student: { select: { name: true, studentCode: true } },
      },
    }),
    sdb.enrollment.findMany({
      where: buildAssignableWhere(cls),
      orderBy: { enrolledAt: "asc" },
      select: {
        id: true,
        status: true,
        student: { select: { name: true, studentCode: true } },
      },
    }),
  ]);

  const activeCount = current.filter((e) =>
    (CAPACITY_COUNT_STATUSES as readonly string[]).includes(e.status),
  ).length;

  // T3.2 — picker sale LỌC THEO CƠ SỞ CỦA LỚP (không gán chéo CS1↔CS2); luôn kèm
  // sale đang gán để <select> không tự rớt giá trị khi họ đổi vai/chuyển cơ sở.
  const sales = await getAssignableSales({
    centerIds: cls.centerId ? [cls.centerId] : [],
    includeIds: current.map((e) => e.saleId),
  });
  const saleOptions = sales.map((s) => ({ id: s.id, name: s.name ?? "(chưa đặt tên)" }));

  const currentRows = current.map((e) => ({
    id: e.id,
    status: e.status,
    statusLabel: STATUS_LABEL[e.status] ?? e.status,
    name: e.student?.name ?? "(không tên)",
    studentCode: e.student?.studentCode ?? null,
    saleId: e.saleId,
  }));
  const assignableRows = assignable.map((e) => ({
    id: e.id,
    status: e.status,
    statusLabel: STATUS_LABEL[e.status] ?? e.status,
    name: e.student?.name ?? "(không tên)",
    studentCode: e.student?.studentCode ?? null,
  }));

  // SUPER_ADMIN/CENTER_MANAGER mới được override sức chứa (classes:create).
  const canOverride = await checkPermission("classes:create", { centerId: cls.centerId });

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-3xl font-black text-neutral-900">
          Học sinh lớp:{" "}
          <span className="font-bold text-orange-600">{cls.name}</span>
        </h1>
        <Link
          href={`/classes/${cls.id}/edit`}
          className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-semibold text-gray-700 hover:bg-gray-50"
        >
          <ArrowLeft className="h-4 w-4" /> Về sửa lớp
        </Link>
      </div>

      <AssignStudents
        classId={cls.id}
        maxStudents={cls.maxStudents}
        activeCount={activeCount}
        current={currentRows}
        assignable={assignableRows}
        canOverride={canOverride}
        sales={saleOptions}
      />
    </div>
  );
}
