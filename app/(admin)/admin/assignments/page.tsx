import Link from "next/link";
import { ClipboardList, FileStack, Plus } from "lucide-react";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { scopedDb, getModelVisibleCenterIds } from "@/lib/db-scope";
import { resolveActor } from "@/lib/auth/actor";
import { checkPermission } from "@/lib/auth/check-permission";
import { AssignmentStatus, SubmissionStatus, type Prisma } from "@prisma/client";
import { formatDateOrDash } from "@/lib/format/date";

export const dynamic = "force-dynamic";

const STATUS_INFO: Record<AssignmentStatus, { label: string; color: string }> = {
  DRAFT: { label: "Đang soạn", color: "bg-gray-100 text-gray-700" },
  PUBLISHED: { label: "Đã giao", color: "bg-green-100 text-green-700" },
  CLOSED: { label: "Đã đóng", color: "bg-amber-100 text-amber-700" },
  ARCHIVED: { label: "Lưu trữ", color: "bg-neutral-100 text-neutral-500" },
};

const VALID_STATUSES = Object.values(AssignmentStatus);

// Bao cả mốc epoch 1970 (seed cũ) → "—", không chỉ null.
const fmtDate = formatDateOrDash;

interface SearchParams {
  searchParams: Promise<{
    q?: string;
    status?: string;
    classId?: string;
  }>;
}

export default async function AssignmentsPage({ searchParams }: SearchParams) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!(await checkPermission("assignments:view"))) {
    redirect("/dashboard?error=unauthorized");
  }
  const canCreateAssignment = await checkPermission("assignments:create");

  // Cách ly cơ sở: Assignment KHÔNG nằm trong SCOPED_MODELS (không có centerId trực
  // tiếp) → scopedDb không auto-scope. Scope thủ công qua class.centerId, dùng cùng
  // tầm nhìn cơ sở của model Class (đã isolate ở /admin/classes).
  const actor = await resolveActor(session.user.id);
  const sdb = scopedDb(actor);
  const visibleClassCenters = getModelVisibleCenterIds("Class", actor);

  const sp = await searchParams;
  const q = sp.q?.trim() || undefined;
  const statusFilter =
    sp.status && VALID_STATUSES.includes(sp.status as AssignmentStatus)
      ? (sp.status as AssignmentStatus)
      : undefined;
  const classFilter = sp.classId?.trim() || undefined;

  const where: Prisma.AssignmentWhereInput = {
    ...(statusFilter ? { status: statusFilter } : {}),
    ...(classFilter ? { classId: classFilter } : {}),
    ...(q
      ? { title: { contains: q, mode: "insensitive" as const } }
      : {}),
  };

  // Scope thủ công qua class.centerId (Assignment phụ thuộc cơ sở qua lớp).
  if (visibleClassCenters !== "ALL") {
    where.class = { centerId: { in: visibleClassCenters } };
  }

  const [assignments, classes] = await Promise.all([
    sdb.assignment.findMany({
      where,
      include: {
        class: { select: { name: true, classCode: true } },
        lesson: { select: { order: true, title: true } },
        _count: { select: { submissions: true, documents: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: 100,
    }),
    sdb.class.findMany({
      where: { deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true, classCode: true },
      take: 200,
    }),
  ]);

  // Stats: how many SUBMITTED / GRADED per assignment
  // (assignmentId đã giới hạn trong danh sách assignment đã được scope ở trên).
  const stats =
    assignments.length > 0
      ? await sdb.assignmentSubmission.groupBy({
          by: ["assignmentId", "status"],
          where: { assignmentId: { in: assignments.map((a) => a.id) } },
          _count: { _all: true },
        })
      : [];

  const statsByAssignment = new Map<
    string,
    { submitted: number; graded: number; late: number; total: number }
  >();
  for (const s of stats) {
    const cur = statsByAssignment.get(s.assignmentId) ?? {
      submitted: 0,
      graded: 0,
      late: 0,
      total: 0,
    };
    cur.total += s._count._all;
    if (s.status === SubmissionStatus.SUBMITTED)
      cur.submitted += s._count._all;
    if (s.status === SubmissionStatus.LATE) cur.late += s._count._all;
    if (s.status === SubmissionStatus.GRADED) cur.graded += s._count._all;
    statsByAssignment.set(s.assignmentId, cur);
  }

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
            <ClipboardList className="h-6 w-6 text-[#7C3AED]" />
            Bài tập
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            {assignments.length > 0
              ? `${assignments.length} bài tập`
              : "Chưa có bài tập nào"}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {canCreateAssignment && (
            <Link
              href="/assignments/templates"
              className="inline-flex items-center gap-1.5 rounded-lg border border-purple-200 bg-white px-4 py-2 text-sm font-semibold text-purple-700 hover:bg-purple-50"
            >
              <FileStack className="h-4 w-4" />
              Mẫu bài tập
            </Link>
          )}
          <Link
            href="/assignments/new"
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#7C3AED] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:opacity-90"
          >
            <Plus className="h-4 w-4" />
            Tạo bài tập mới
          </Link>
        </div>
      </div>

      <form
        method="GET"
        className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
      >
        <input
          name="q"
          defaultValue={q}
          placeholder="Tìm tiêu đề..."
          className="lg:col-span-2 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[#7C3AED] focus:outline-none focus:ring-2 focus:ring-[#7C3AED]/20"
        />
        <select
          name="status"
          defaultValue={statusFilter ?? ""}
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[#7C3AED] focus:outline-none"
        >
          <option value="">Mọi trạng thái</option>
          {Object.entries(STATUS_INFO).map(([v, { label }]) => (
            <option key={v} value={v}>
              {label}
            </option>
          ))}
        </select>
        <select
          name="classId"
          defaultValue={classFilter ?? ""}
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[#7C3AED] focus:outline-none"
        >
          <option value="">Mọi lớp</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.classCode ? `${c.classCode} · ` : ""}
              {c.name}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="rounded-lg bg-[#7C3AED] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 sm:col-span-2 lg:col-span-4"
        >
          Áp dụng bộ lọc
        </button>
      </form>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-100">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Tiêu đề
                </th>
                <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Lớp
                </th>
                <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Hạn nộp
                </th>
                <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Trạng thái
                </th>
                <th className="px-3 py-3 text-center text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Tài liệu
                </th>
                <th className="px-3 py-3 text-center text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Nộp / Chấm
                </th>
                <th className="px-3 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Hành động
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {assignments.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-12 text-center text-sm text-gray-400"
                  >
                    Chưa có bài tập nào khớp bộ lọc.{" "}
                    <Link
                      href="/assignments/new"
                      className="text-[#7C3AED] hover:underline"
                    >
                      Tạo mới →
                    </Link>
                  </td>
                </tr>
              ) : (
                assignments.map((a) => {
                  const statusInfo = STATUS_INFO[a.status];
                  const s = statsByAssignment.get(a.id) ?? {
                    submitted: 0,
                    graded: 0,
                    late: 0,
                    total: 0,
                  };
                  const submittedTotal = s.submitted + s.late + s.graded;
                  return (
                    <tr key={a.id} className="hover:bg-gray-50/60">
                      <td className="px-3 py-3">
                        <div className="font-medium text-gray-900 line-clamp-1">
                          {a.title}
                        </div>
                        {a.lesson && (
                          <div className="text-xs text-gray-400">
                            Bài {a.lesson.order}: {a.lesson.title}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-3 text-xs text-gray-600">
                        <div className="font-medium">{a.class.name}</div>
                        {a.class.classCode && (
                          <div className="text-gray-400 tabular-nums">
                            {a.class.classCode}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-3 text-sm tabular-nums text-gray-500">
                        {fmtDate(a.dueAt)}
                      </td>
                      <td className="px-3 py-3">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusInfo.color}`}
                        >
                          {statusInfo.label}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-center text-sm tabular-nums text-gray-700">
                        {a._count.documents}
                      </td>
                      <td className="px-3 py-3 text-center text-xs tabular-nums">
                        {s.total > 0 ? (
                          <>
                            <span className="font-semibold text-gray-700">
                              {submittedTotal}
                            </span>
                            <span className="text-gray-400">/{s.total}</span>
                            {s.graded > 0 && (
                              <span className="ml-1 text-green-600">
                                ({s.graded}✓)
                              </span>
                            )}
                          </>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-right">
                        <Link
                          href={`/assignments/${a.id}/edit`}
                          className="inline-flex items-center gap-1 rounded-md border border-purple-200 px-2.5 py-1 text-xs font-semibold text-purple-700 hover:bg-purple-50"
                        >
                          Mở
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
