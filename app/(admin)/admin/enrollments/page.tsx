import Link from "next/link";
import { Plus, ClipboardList, Pencil } from "lucide-react";
import { db } from "@/lib/db";
import { EnrollmentStatus, type Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

const STATUS_INFO: Record<EnrollmentStatus, { label: string; color: string }> = {
  PENDING: { label: "Chờ xếp", color: "bg-gray-100 text-gray-700" },
  CONFIRMED: { label: "Đã xếp", color: "bg-amber-100 text-amber-700" },
  STUDYING: { label: "Đang học", color: "bg-green-100 text-green-700" },
  PAUSED: { label: "Bảo lưu", color: "bg-yellow-100 text-yellow-700" },
  COMPLETED: { label: "Hoàn thành", color: "bg-blue-100 text-blue-700" },
  WITHDREW: { label: "Đã rút", color: "bg-red-100 text-red-700" },
  TRANSFERRED: { label: "Đã chuyển", color: "bg-purple-100 text-purple-700" },
  // Legacy values
  ACTIVE: { label: "Đang học (legacy)", color: "bg-green-100 text-green-700" },
  CANCELLED: { label: "Đã huỷ", color: "bg-red-100 text-red-700" },
};

const DEFAULT_ACTIVE_STATUSES: EnrollmentStatus[] = [
  "PENDING",
  "CONFIRMED",
  "STUDYING",
  "ACTIVE",
];

const VALID_STATUSES = Object.values(EnrollmentStatus);

function formatDate(d: Date | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("vi-VN");
}

interface SearchParams {
  searchParams: Promise<{
    q?: string;
    status?: string;
    classId?: string;
    centerId?: string;
  }>;
}

export default async function EnrollmentsAdminPage({ searchParams }: SearchParams) {
  const sp = await searchParams;
  const q = sp.q?.trim() || undefined;
  const statusParam = sp.status;
  const classFilter = sp.classId?.trim() || undefined;
  const centerFilter = sp.centerId?.trim() || undefined;

  const statusFilter: EnrollmentStatus | "active" | "all" =
    statusParam === "all"
      ? "all"
      : statusParam && VALID_STATUSES.includes(statusParam as EnrollmentStatus)
        ? (statusParam as EnrollmentStatus)
        : "active";

  const where: Prisma.EnrollmentWhereInput = {};
  if (statusFilter === "active") {
    where.status = { in: DEFAULT_ACTIVE_STATUSES };
  } else if (statusFilter !== "all") {
    where.status = statusFilter;
  }
  if (classFilter) where.classId = classFilter;
  if (centerFilter) where.class = { centerId: centerFilter };
  if (q) {
    where.OR = [
      { student: { name: { contains: q, mode: "insensitive" } } },
      { student: { parentPhone: { contains: q } } },
      { student: { phone: { contains: q } } },
      { class: { name: { contains: q, mode: "insensitive" } } },
      { class: { classCode: { contains: q, mode: "insensitive" } } },
    ];
  }

  const [enrollments, classes, centers] = await Promise.all([
    db.enrollment.findMany({
      where,
      orderBy: [{ status: "asc" }, { enrolledAt: "desc" }],
      take: 100,
      select: {
        id: true,
        status: true,
        enrolledAt: true,
        startedAt: true,
        student: {
          select: {
            id: true,
            name: true,
            avatarUrl: true,
            parentPhone: true,
            phone: true,
          },
        },
        class: {
          select: {
            id: true,
            name: true,
            classCode: true,
            center: { select: { name: true } },
          },
        },
      },
    }),
    db.class.findMany({
      where: { deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true, classCode: true },
      take: 200,
    }),
    db.center.findMany({
      where: { isActive: true },
      orderBy: { displayOrder: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
            <ClipboardList className="h-6 w-6 text-[#7C3AED]" />
            Đăng ký học
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            {enrollments.length > 0
              ? `${enrollments.length} đăng ký${statusFilter === "active" ? " (đang hoạt động)" : ""}`
              : "Chưa có đăng ký nào"}
          </p>
        </div>
        <Link
          href="/admin/enrollments/new"
          className="inline-flex items-center gap-1.5 rounded-lg bg-[#7C3AED] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:opacity-90"
        >
          <Plus className="h-4 w-4" />
          Đăng ký mới
        </Link>
      </div>

      <form
        method="GET"
        className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5"
      >
        <input
          name="q"
          defaultValue={q}
          placeholder="Tìm HS / SĐT PH / tên lớp / mã lớp..."
          className="lg:col-span-2 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[#7C3AED] focus:outline-none focus:ring-2 focus:ring-[#7C3AED]/20"
        />
        <select
          name="status"
          defaultValue={statusParam ?? "active"}
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[#7C3AED] focus:outline-none"
        >
          <option value="active">Đang hoạt động (mặc định)</option>
          <option value="all">Tất cả trạng thái</option>
          <option value="PENDING">Chờ xếp</option>
          <option value="CONFIRMED">Đã xếp</option>
          <option value="STUDYING">Đang học</option>
          <option value="PAUSED">Bảo lưu</option>
          <option value="COMPLETED">Hoàn thành</option>
          <option value="WITHDREW">Đã rút</option>
          <option value="TRANSFERRED">Đã chuyển</option>
        </select>
        <select
          name="classId"
          defaultValue={classFilter ?? ""}
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[#7C3AED] focus:outline-none"
        >
          <option value="">Tất cả lớp</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.classCode ? `${c.classCode} · ` : ""}
              {c.name}
            </option>
          ))}
        </select>
        <select
          name="centerId"
          defaultValue={centerFilter ?? ""}
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[#7C3AED] focus:outline-none"
        >
          <option value="">Tất cả cơ sở</option>
          {centers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="rounded-lg bg-[#7C3AED] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 sm:col-span-2 lg:col-span-5"
        >
          Áp dụng bộ lọc
        </button>
      </form>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-100">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Học viên
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Lớp / Cơ sở
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Trạng thái
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Ngày đăng ký
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Hành động
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {enrollments.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-sm text-gray-400">
                    Chưa có đăng ký nào khớp bộ lọc.{" "}
                    <Link href="/admin/enrollments/new" className="text-[#7C3AED] hover:underline">
                      Tạo đăng ký mới →
                    </Link>
                  </td>
                </tr>
              ) : (
                enrollments.map((e) => {
                  const statusInfo =
                    STATUS_INFO[e.status] ?? {
                      label: e.status,
                      color: "bg-gray-100 text-gray-500",
                    };
                  const parentPhone = e.student.parentPhone ?? e.student.phone;
                  return (
                    <tr key={e.id} className="hover:bg-gray-50/60">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          {e.student.avatarUrl ? (
                            <img
                              src={e.student.avatarUrl}
                              alt={e.student.name}
                              className="h-9 w-9 rounded-full border border-gray-200 object-cover"
                            />
                          ) : (
                            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 text-xs font-bold text-gray-500">
                              {e.student.name.charAt(0).toUpperCase()}
                            </div>
                          )}
                          <div>
                            <div className="font-medium text-gray-900">{e.student.name}</div>
                            {parentPhone && (
                              <div className="text-xs text-gray-400 tabular-nums">{parentPhone}</div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        <div className="font-medium text-gray-900">{e.class.name}</div>
                        <div className="text-xs text-gray-400">
                          {e.class.classCode ? `${e.class.classCode} · ` : ""}
                          {e.class.center?.name ?? "—"}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusInfo.color}`}
                        >
                          {statusInfo.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm tabular-nums text-gray-500">
                        {formatDate(e.enrolledAt)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={`/admin/enrollments/${e.id}/edit`}
                          className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2.5 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          Sửa
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
