import Link from "next/link";
import { Plus, ClipboardList } from "lucide-react";
import { db } from "@/lib/db";
import { EnrollmentListRow } from "./_components/enrollment-list-row";

export const dynamic = "force-dynamic";

const ALL_STATUSES = ["ACTIVE", "PAUSED", "COMPLETED", "CANCELLED"] as const;
type StatusFilter = (typeof ALL_STATUSES)[number] | "all";

interface SearchParams {
  searchParams: Promise<{ status?: string; q?: string }>;
}

export default async function EnrollmentsAdminPage({ searchParams }: SearchParams) {
  const sp = await searchParams;
  const statusFilter: StatusFilter = ALL_STATUSES.includes(sp.status as never)
    ? (sp.status as StatusFilter)
    : "all";
  const q = sp.q?.trim();

  const enrollments = await db.enrollment.findMany({
    where: {
      ...(statusFilter !== "all" ? { status: statusFilter } : {}),
      ...(q
        ? {
            OR: [
              { student: { name: { contains: q, mode: "insensitive" as const } } },
              { student: { phone: { contains: q } } },
              { class: { name: { contains: q, mode: "insensitive" as const } } },
            ],
          }
        : {}),
    },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 200,
    select: {
      id: true,
      status: true,
      tuition: true,
      paidAt: true,
      startDate: true,
      endDate: true,
      student: { select: { name: true, phone: true } },
      class: { select: { name: true, course: { select: { name: true } } } },
    },
  });

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-black text-neutral-900">
            <ClipboardList className="h-7 w-7 text-orange-500" />
            Đăng ký học
          </h1>
          <p className="mt-1 text-neutral-600">
            Quản lý đăng ký lớp · {enrollments.length} đăng ký
          </p>
        </div>
        <Link
          href="/admin/enrollments/new"
          className="inline-flex items-center gap-2 rounded-xl bg-orange-500 px-4 py-2 font-bold text-white shadow-md hover:bg-orange-600"
        >
          <Plus className="h-5 w-5" />
          Đăng ký mới
        </Link>
      </div>

      <form method="GET" className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          type="search"
          name="q"
          defaultValue={q ?? ""}
          placeholder="Tìm theo tên HV / SĐT / tên lớp..."
          className="flex-1 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 sm:max-w-sm"
        />
        <select
          name="status"
          defaultValue={statusFilter}
          className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-orange-500"
        >
          <option value="all">Tất cả trạng thái</option>
          <option value="ACTIVE">Đang học</option>
          <option value="PAUSED">Tạm ngừng</option>
          <option value="COMPLETED">Hoàn thành</option>
          <option value="CANCELLED">Đã huỷ</option>
        </select>
        <button
          type="submit"
          className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-bold text-white hover:bg-orange-600"
        >
          Lọc
        </button>
      </form>

      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
        <table className="w-full">
          <thead className="border-b border-neutral-200 bg-neutral-50 text-left">
            <tr>
              <th className="p-4 text-xs font-bold uppercase tracking-wider text-neutral-700">Học viên</th>
              <th className="p-4 text-xs font-bold uppercase tracking-wider text-neutral-700">Lớp / Khoá</th>
              <th className="p-4 text-center text-xs font-bold uppercase tracking-wider text-neutral-700">Trạng thái</th>
              <th className="p-4 text-right text-xs font-bold uppercase tracking-wider text-neutral-700">Học phí</th>
              <th className="p-4 text-xs font-bold uppercase tracking-wider text-neutral-700">Lịch học</th>
              <th className="p-4 text-right text-xs font-bold uppercase tracking-wider text-neutral-700">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {enrollments.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-12 text-center text-neutral-500">
                  Chưa có đăng ký nào khớp bộ lọc.{" "}
                  <Link href="/admin/enrollments/new" className="text-orange-600 hover:underline">
                    Tạo đăng ký mới →
                  </Link>
                </td>
              </tr>
            ) : (
              enrollments.map((e) => (
                <EnrollmentListRow
                  key={e.id}
                  enrollment={{
                    id: e.id,
                    studentName: e.student.name,
                    studentPhone: e.student.phone,
                    className: e.class.name,
                    courseName: e.class.course.name,
                    status: e.status,
                    tuition: e.tuition,
                    paidAt: e.paidAt,
                    startDate: e.startDate,
                    endDate: e.endDate,
                  }}
                />
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
