import Link from "next/link";
import { FileSpreadsheet, Plus } from "lucide-react";
import { DeleteStudentButton } from "./_components/delete-student-button";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { scopedDb } from "@/lib/db-scope";
import { resolveActor } from "@/lib/auth/actor";
import { checkAnyPermission, checkPermission } from "@/lib/auth/check-permission";
import { PAGE_GATES } from "@/lib/auth/page-gates";
import { getSetting } from "@/lib/settings/service";
import { canViewLeadPii } from "@/lib/auth/permissions";
import { maskPhone } from "@/lib/utils";
import { StudentStatus, type Prisma } from "@prisma/client";
import {
  buildLifecycleWhere,
  postFilterFrequentlyAbsent,
  LIFECYCLE_VIEW_LABEL,
  LIFECYCLE_VIEW_DESCRIPTION,
  LIFECYCLE_VIEWS,
  type LifecycleView,
} from "@/lib/students/lifecycle";

export const dynamic = "force-dynamic";

const STATUS_INFO: Record<StudentStatus, { label: string; color: string }> = {
  ACTIVE: { label: "Đang học", color: "bg-green-100 text-green-700" },
  PAUSED: { label: "Bảo lưu", color: "bg-yellow-100 text-yellow-700" },
  GRADUATED: { label: "Hoàn thành", color: "bg-blue-100 text-blue-700" },
  INACTIVE: { label: "Nghỉ học", color: "bg-gray-100 text-gray-500" },
};

function formatDate(date: Date): string {
  return new Date(date).toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

interface SearchParams {
  searchParams: Promise<{
    q?: string;
    status?: string;
    centerId?: string;
    grade?: string;
    page?: string;
    view?: string;
  }>;
}

const PAGE_SIZE = 20;
const VALID_STATUSES = Object.values(StudentStatus);
const FREQUENT_ABSENT_FETCH_LIMIT = 500;

function isValidView(v: string | undefined): v is LifecycleView {
  return LIFECYCLE_VIEWS.includes(v as LifecycleView);
}

type StudentRow = {
  id: string;
  name: string;
  studentCode: string | null;
  avatarUrl: string | null;
  currentGrade: number | null;
  status: StudentStatus;
  parentName: string | null;
  parentPhone: string | null;
  createdAt: Date;
  enrollmentDate: Date | null;
  preferredCenter: { name: string } | null;
  center: { name: string } | null;
  _count: { enrollments: number };
  reserves: Array<{
    id: string;
    startedAt: Date;
    expectedEndAt: Date | null;
    reason: string;
  }>;
};

const STUDENT_LIST_SELECT = {
  id: true,
  name: true,
  studentCode: true,
  avatarUrl: true,
  currentGrade: true,
  status: true,
  parentName: true,
  parentPhone: true,
  createdAt: true,
  enrollmentDate: true,
  preferredCenter: { select: { name: true } },
  center: { select: { name: true } },
  _count: { select: { enrollments: true } },
  reserves: {
    where: { isActive: true },
    select: {
      id: true,
      startedAt: true,
      expectedEndAt: true,
      reason: true,
    },
    take: 1,
    orderBy: { startedAt: "desc" as const },
  },
} satisfies Prisma.StudentSelect;

export default async function StudentsPage({ searchParams }: SearchParams) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!(await checkAnyPermission(PAGE_GATES["/students"]))) redirect("/dashboard");

  const canCreate = await checkPermission("students:create");
  const canUpdate = await checkPermission("students:edit");
  const canDelete = await checkPermission("students:delete");
  const showActions = canUpdate || canDelete;
  // #11 — che SĐT phụ huynh mặc định (đồng nhất với leads/payments); chỉ role có
  // quyền xem PII liên hệ (leads:view-pii) mới thấy đầy đủ.
  const canViewPii = canViewLeadPii(session.user);

  // Cách ly cơ sở: Student ∈ SCOPED_MODELS (có centerId) → scopedDb tự inject
  // `centerId IN visibleCenters`. Mọi đọc Student đi qua sdb. SUPER_ADMIN/HO bypass.
  const actor = await resolveActor(session.user.id);
  const sdb = scopedDb(actor);

  const sp = await searchParams;
  const view: LifecycleView = isValidView(sp.view) ? sp.view : "all";
  const q = sp.q?.trim() ?? "";
  const centerId = sp.centerId?.trim() ?? "";
  const gradeRaw = sp.grade?.trim() ?? "";
  const grade =
    gradeRaw && /^\d+$/.test(gradeRaw)
      ? Math.max(1, Math.min(12, Number(gradeRaw)))
      : undefined;
  const statusParam =
    sp.status && VALID_STATUSES.includes(sp.status as StudentStatus)
      ? (sp.status as StudentStatus)
      : undefined;
  const page = Math.max(1, Number(sp.page) || 1);

  // Build base filters (search, center, grade). Note: centerId param maps
  // to Student.preferredCenterId — same field that the existing list filtered
  // on before lifecycle tabs were added.
  const baseFilters: Prisma.StudentWhereInput = {};
  if (q) {
    baseFilters.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { studentCode: { contains: q, mode: "insensitive" } },
      { parentName: { contains: q, mode: "insensitive" } },
      { parentPhone: { contains: q } },
      { phone: { contains: q } },
    ];
  }
  if (centerId) baseFilters.preferredCenterId = centerId;
  if (grade != null) baseFilters.currentGrade = grade;
  // Status filter only meaningful on "all" view — other views encode status implicitly.
  if (view === "all" && statusParam) baseFilters.status = statusParam;

  const [renewalWindowDays, absentThreshold, absentWindow] = await Promise.all([
    getSetting("student.renewalWindowDays"),
    getSetting("student.frequentAbsentThreshold"),
    getSetting("student.frequentAbsentWindow"),
  ]);
  const where = buildLifecycleWhere(view, baseFilters, renewalWindowDays);

  // ─── DATA FETCH ───
  let students: StudentRow[] = [];
  let totalCount: number;

  if (view === "frequent-absent") {
    // Post-filter approach: load base candidates, then JS-filter.
    const baseStudents = await sdb.student.findMany({
      where,
      select: { id: true },
      take: FREQUENT_ABSENT_FETCH_LIMIT,
    });
    const filteredIds = await postFilterFrequentlyAbsent(
      baseStudents.map((s) => s.id),
      absentThreshold,
      absentWindow,
    );
    const filteredArr = Array.from(filteredIds);
    totalCount = filteredArr.length;
    const pageIds = filteredArr.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

    if (pageIds.length > 0) {
      const rows = await sdb.student.findMany({
        where: { id: { in: pageIds } },
        select: STUDENT_LIST_SELECT,
        orderBy: [{ name: "asc" }],
      });
      students = rows as StudentRow[];
    }
  } else {
    const [count, rows] = await Promise.all([
      sdb.student.count({ where }),
      sdb.student.findMany({
        where,
        select: STUDENT_LIST_SELECT,
        orderBy: [{ createdAt: "desc" }],
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
    ]);
    totalCount = count;
    students = rows as StudentRow[];
  }

  // Che SĐT phụ huynh ở SERVER cho actor thiếu quyền (chống leak qua RSC payload).
  if (!canViewPii) {
    students = students.map((s) => ({
      ...s,
      parentPhone: s.parentPhone ? maskPhone(s.parentPhone) : s.parentPhone,
    }));
  }

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  const centers = await sdb.center.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  // URL helper preserving filters across tab/page transitions
  function urlFor(
    params: Partial<{
      view: LifecycleView;
      page: number;
      q: string;
      centerId: string;
      grade: string;
      status: string;
    }>,
  ): string {
    const u = new URLSearchParams();
    if (params.view && params.view !== "all") u.set("view", params.view);
    if (params.page && params.page > 1) u.set("page", String(params.page));
    if (params.q) u.set("q", params.q);
    if (params.centerId) u.set("centerId", params.centerId);
    if (params.grade) u.set("grade", params.grade);
    if (params.status) u.set("status", params.status);
    return `/students${u.toString() ? "?" + u.toString() : ""}`;
  }

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Học viên</h1>
          <p className="mt-1 text-sm text-gray-500">
            {LIFECYCLE_VIEW_DESCRIPTION[view]}
          </p>
        </div>
        {canCreate && (
          <div className="flex gap-2">
            <Link
              href="/students/new"
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#7C3AED] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:opacity-90"
            >
              <Plus className="h-4 w-4" />
              Thêm học viên
            </Link>
            <Link
              href="/students/import"
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
            >
              <FileSpreadsheet className="h-4 w-4" />
              Import Excel
            </Link>
          </div>
        )}
      </div>

      {/* Lifecycle tabs */}
      <div className="mb-4 border-b border-gray-200">
        <nav className="-mb-px flex gap-1 overflow-x-auto">
          {LIFECYCLE_VIEWS.map((v) => {
            const active = v === view;
            return (
              <Link
                key={v}
                href={urlFor({
                  view: v,
                  q,
                  centerId,
                  grade: grade != null ? String(grade) : "",
                })}
                className={
                  "whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium " +
                  (active
                    ? "border-[#7C3AED] text-[#7C3AED]"
                    : "border-transparent text-gray-600 hover:border-gray-300 hover:text-gray-900")
                }
              >
                {LIFECYCLE_VIEW_LABEL[v]}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Filters */}
      <form
        method="GET"
        className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5"
      >
        {view !== "all" && <input type="hidden" name="view" value={view} />}
        <input
          name="q"
          defaultValue={q}
          placeholder="Tên / mã / phụ huynh / SĐT phụ huynh..."
          className="lg:col-span-2 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[#7C3AED] focus:outline-none focus:ring-2 focus:ring-[#7C3AED]/20"
        />
        {view === "all" && (
          <select
            name="status"
            defaultValue={statusParam ?? ""}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[#7C3AED] focus:outline-none"
          >
            <option value="">Tất cả trạng thái</option>
            {VALID_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_INFO[s].label}
              </option>
            ))}
          </select>
        )}
        <select
          name="centerId"
          defaultValue={centerId}
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[#7C3AED] focus:outline-none"
        >
          <option value="">Tất cả cơ sở</option>
          {centers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          name="grade"
          defaultValue={grade != null ? String(grade) : ""}
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[#7C3AED] focus:outline-none"
        >
          <option value="">Tất cả lớp</option>
          {Array.from({ length: 12 }, (_, i) => i + 1).map((g) => (
            <option key={g} value={g}>
              Lớp {g}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="rounded-lg bg-[#7C3AED] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 sm:col-span-2 lg:col-span-1"
        >
          Áp dụng
        </button>
      </form>

      <div className="mb-2 text-sm text-gray-600">
        {totalCount.toLocaleString("vi-VN")} học viên
        {view === "frequent-absent" &&
          totalCount === FREQUENT_ABSENT_FETCH_LIMIT && (
            <span className="ml-2 text-orange-600">
              (cap {FREQUENT_ABSENT_FETCH_LIMIT} — refine filter để xem hết)
            </span>
          )}
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-100">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Ảnh
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Học viên
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Lớp
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Phụ huynh
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Cơ sở
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Khoá
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Trạng thái
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Ngày tạo
                </th>
                {showActions && (
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Hành động
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {students.length === 0 ? (
                <tr>
                  <td
                    colSpan={showActions ? 9 : 8}
                    className="px-4 py-12 text-center text-sm text-gray-400"
                  >
                    Không có học viên trong view này
                  </td>
                </tr>
              ) : (
                students.map((s) => {
                  const statusInfo = STATUS_INFO[s.status] ?? {
                    label: s.status,
                    color: "bg-gray-100 text-gray-500",
                  };
                  const reserve = s.reserves[0];
                  return (
                    <tr key={s.id} className="hover:bg-gray-50/60">
                      <td className="px-4 py-3">
                        {s.avatarUrl ? (
                          <img
                            src={s.avatarUrl}
                            alt={s.name}
                            className="h-9 w-9 rounded-full border border-gray-200 object-cover"
                          />
                        ) : (
                          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 text-xs font-bold text-gray-500">
                            {s.name.charAt(0).toUpperCase()}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900">
                          {s.name}
                        </div>
                        {s.studentCode && (
                          <div className="text-xs tabular-nums text-gray-400">
                            {s.studentCode}
                          </div>
                        )}
                        {reserve && (
                          <div
                            className="mt-0.5 text-xs text-yellow-700"
                            title={reserve.reason}
                          >
                            🟡 Bảo lưu từ {formatDate(reserve.startedAt)}
                            {reserve.expectedEndAt &&
                              ` → ${formatDate(reserve.expectedEndAt)}`}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm tabular-nums text-gray-600">
                        {s.currentGrade ? `Lớp ${s.currentGrade}` : "—"}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        <div>{s.parentName ?? "—"}</div>
                        {s.parentPhone && (
                          <div className="text-xs tabular-nums text-gray-400">
                            {s.parentPhone}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {s.preferredCenter?.name ?? s.center?.name ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-right text-sm tabular-nums text-gray-600">
                        {s._count.enrollments}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusInfo.color}`}
                        >
                          {statusInfo.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm tabular-nums text-gray-500">
                        {formatDate(s.createdAt)}
                      </td>
                      {showActions && (
                        <td className="px-4 py-3 text-right">
                          <div className="flex justify-end gap-2">
                            {canUpdate && (
                              <Link
                                href={`/students/${s.id}/edit`}
                                className="rounded-md border border-gray-200 px-2.5 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                              >
                                Sửa
                              </Link>
                            )}
                            {canDelete && s.status === "INACTIVE" && (
                              <DeleteStudentButton
                                studentId={s.id}
                                studentName={s.name}
                              />
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm text-gray-500">
          <span>
            Trang {page}/{totalPages} ·{" "}
            {totalCount.toLocaleString("vi-VN")} học viên
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link
                href={urlFor({
                  view,
                  page: page - 1,
                  q,
                  centerId,
                  grade: grade != null ? String(grade) : "",
                  status: statusParam,
                })}
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm hover:bg-gray-50"
              >
                ← Trước
              </Link>
            )}
            {page < totalPages && (
              <Link
                href={urlFor({
                  view,
                  page: page + 1,
                  q,
                  centerId,
                  grade: grade != null ? String(grade) : "",
                  status: statusParam,
                })}
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm hover:bg-gray-50"
              >
                Sau →
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
