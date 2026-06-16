import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Plus, Search, FileSpreadsheet } from "lucide-react";
import { db } from "@/lib/db";
import { can } from "@/lib/auth/permissions";
import { EmployeesAdminTable } from "@/components/admin/nhan-su/employees-admin-table";
import type { Department, EmploymentStatus, Prisma } from "@prisma/client";

export const metadata = { title: "Quản lý nhân sự | Admin" };

const DEPARTMENTS: Department[] = [
  "BAN_GIAM_DOC",
  "DAO_TAO",
  "MARKETING",
  "KINH_DOANH",
  "IT",
  "HANH_CHANH_NHAN_SU",
  "KE_TOAN",
  "TUYEN_SINH",
  "GIAO_VU",
  "GIANG_DAY",
];

const STATUSES: EmploymentStatus[] = ["ACTIVE", "ON_LEAVE", "RESIGNED", "TERMINATED"];

const STATUS_LABEL: Record<EmploymentStatus, string> = {
  ACTIVE: "Đang làm",
  ON_LEAVE: "Tạm nghỉ",
  RESIGNED: "Đã nghỉ",
  TERMINATED: "Cho nghỉ",
};

// Nhãn phòng ban tiếng Việt CÓ DẤU.
const DEPARTMENT_LABEL: Record<Department, string> = {
  BAN_GIAM_DOC: "Ban Giám Đốc",
  DAO_TAO: "Đào Tạo",
  MARKETING: "Marketing",
  KINH_DOANH: "Kinh Doanh",
  IT: "IT",
  HANH_CHANH_NHAN_SU: "Hành Chính Nhân Sự",
  KE_TOAN: "Kế Toán",
  TUYEN_SINH: "Tuyển Sinh",
  GIAO_VU: "Giáo Vụ",
  GIANG_DAY: "Giảng Dạy",
};
const deptLabel = (d: string) => DEPARTMENT_LABEL[d as Department] ?? d.replace(/_/g, " ");

interface PageProps {
  searchParams: Promise<{
    q?: string;
    department?: string;
    centerId?: string;
    status?: string;
  }>;
}

export default async function EmployeesAdminPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  if (!can(session.user, "employees:view-all")) {
    redirect("/dashboard");
  }

  const params = await searchParams;
  const q = params.q?.trim() ?? "";
  const departmentParam =
    params.department && DEPARTMENTS.includes(params.department as Department)
      ? (params.department as Department)
      : undefined;
  const centerIdParam = params.centerId?.trim() ?? "";
  const rawStatus = params.status;
  const statusParam: EmploymentStatus | undefined =
    rawStatus === "ALL"
      ? undefined
      : rawStatus && STATUSES.includes(rawStatus as EmploymentStatus)
        ? (rawStatus as EmploymentStatus)
        : "ACTIVE"; // default: only Active

  const where: Prisma.EmployeeWhereInput = {};
  if (departmentParam) where.department = departmentParam;
  if (centerIdParam) where.centerId = centerIdParam;
  if (statusParam) where.status = statusParam;
  if (q) {
    where.OR = [
      { fullName: { contains: q, mode: "insensitive" } },
      { phone: { contains: q } },
      { email: { contains: q, mode: "insensitive" } },
      { employeeCode: { contains: q, mode: "insensitive" } },
    ];
  }

  // Đơn vị Hội sở (HO) — OrgUnit type=HO (Doc 15 OI-1). Dùng để gắn cờ "Nhân viên HO"
  // trên cột Cơ sở cho NV không gán Center mà có EmployeeOrgAssignment PRIMARY tới HO.
  const hoUnit = await db.orgUnit.findFirst({
    where: { type: "HO", deletedAt: null },
    select: { id: true },
  });

  const [employees, departmentCounts, centers, hoAssignments] = await Promise.all([
    db.employee.findMany({
      where,
      orderBy: [{ displayOrder: "asc" }, { fullName: "asc" }],
      take: 200,
      include: {
        center: { select: { name: true } },
        manager: { select: { fullName: true } },
        userAccount: { select: { role: true, roles: true } },
      },
    }),
    db.employee.groupBy({
      by: ["department"],
      _count: { id: true },
      where: { status: "ACTIVE" },
    }),
    db.center.findMany({
      where: { isActive: true },
      orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true },
    }),
    hoUnit
      ? db.employeeOrgAssignment.findMany({
          where: { orgUnitId: hoUnit.id, status: "ACTIVE" },
          select: { employeeId: true },
        })
      : Promise.resolve([] as { employeeId: string }[]),
  ]);

  const hoEmployeeIds = hoAssignments.map((a) => a.employeeId);

  const canCreate = can(session.user, "employees:create");
  const canDelete = can(session.user, "employees:delete");

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Quản lý nhân sự</h1>
          <p className="mt-1 text-sm text-gray-500">
            {employees.length} nhân sự
            {departmentParam && ` · ${deptLabel(departmentParam)}`}
            {statusParam && ` · ${STATUS_LABEL[statusParam]}`}
            {q && ` · "${q}"`}
            {employees.length >= 200 && " (giới hạn 200, dùng filter để thu hẹp)"}
          </p>
        </div>
        {canCreate && (
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/nhan-su/import"
              className="inline-flex items-center gap-2 rounded-lg border-2 border-neutral-200 bg-white px-4 py-2 text-sm font-bold text-neutral-700 hover:bg-neutral-50"
            >
              <FileSpreadsheet className="h-4 w-4" />
              Import Excel
            </Link>
            <Link
              href="/nhan-su/new"
              className="inline-flex items-center gap-2 rounded-lg bg-[#7C3AED] px-4 py-2 text-sm font-bold text-white hover:opacity-90"
            >
              <Plus className="h-4 w-4" />
              Thêm nhân sự
            </Link>
          </div>
        )}
      </div>

      {/* Filter bar */}
      <form
        method="GET"
        className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto_auto_auto_auto]"
      >
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            name="q"
            defaultValue={q}
            placeholder="Tìm theo tên, SĐT, email, mã NV..."
            className="w-full rounded-lg border border-gray-300 bg-white pl-9 pr-3 py-2 text-sm focus:border-[#7C3AED] focus:outline-none"
          />
        </div>
        <select
          name="department"
          defaultValue={departmentParam ?? ""}
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-[#7C3AED] focus:outline-none"
        >
          <option value="">Tất cả phòng ban</option>
          {DEPARTMENTS.map((d) => (
            <option key={d} value={d}>
              {deptLabel(d)}
            </option>
          ))}
        </select>
        <select
          name="centerId"
          defaultValue={centerIdParam}
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-[#7C3AED] focus:outline-none"
        >
          <option value="">Tất cả cơ sở</option>
          {centers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          name="status"
          defaultValue={rawStatus ?? "ACTIVE"}
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-[#7C3AED] focus:outline-none"
        >
          <option value="ALL">Mọi trạng thái</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="rounded-lg bg-[#7C3AED] px-4 py-2 text-sm font-bold text-white hover:opacity-90"
        >
          Lọc
        </button>
      </form>

      {/* Department chips (quick filter, kept for backward UX) */}
      <div className="mb-4 flex flex-wrap gap-2">
        <Link
          href="/nhan-su"
          className={`rounded-full px-3 py-1 text-xs font-semibold ${
            !departmentParam
              ? "bg-[#7C3AED] text-white"
              : "bg-gray-100 text-gray-700 hover:bg-gray-200"
          }`}
        >
          Tất cả
        </Link>
        {departmentCounts.map((d) => (
          <Link
            key={d.department}
            href={`/nhan-su?department=${d.department}`}
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              departmentParam === d.department
                ? "bg-[#7C3AED] text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            {deptLabel(d.department)} ({d._count.id})
          </Link>
        ))}
      </div>

      <EmployeesAdminTable
        employees={employees}
        canDelete={canDelete}
        hoEmployeeIds={hoEmployeeIds}
      />
    </div>
  );
}
