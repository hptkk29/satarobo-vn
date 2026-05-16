import Link from 'next/link'
import { FileSpreadsheet, Plus } from 'lucide-react'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { hasPermission } from '@/lib/permissions'
import { StudentStatus } from '@prisma/client'

const STATUS_INFO: Record<StudentStatus, { label: string; color: string }> = {
  ACTIVE: { label: 'Đang học', color: 'bg-green-100 text-green-700' },
  PAUSED: { label: 'Bảo lưu', color: 'bg-yellow-100 text-yellow-700' },
  GRADUATED: { label: 'Hoàn thành', color: 'bg-blue-100 text-blue-700' },
  INACTIVE: { label: 'Nghỉ học', color: 'bg-gray-100 text-gray-500' },
}

function formatDate(date: Date) {
  return new Date(date).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

interface SearchParams {
  searchParams: Promise<{
    q?: string
    status?: string
    centerId?: string
    grade?: string
    page?: string
  }>
}

const PAGE_SIZE = 20
const VALID_STATUSES = Object.values(StudentStatus)

export default async function StudentsPage({ searchParams }: SearchParams) {
  const session = await auth()
  if (!session?.user) redirect('/login')
  if (!hasPermission(session.user, 'read', 'student')) redirect('/admin/dashboard')

  const canCreate = hasPermission(session.user, 'create', 'student')
  const canUpdate = hasPermission(session.user, 'update', 'student')

  const params = await searchParams
  const q = params.q?.trim() || undefined
  const statusParam = params.status
  // Default: ACTIVE. "all" disables status filter.
  const statusFilter: StudentStatus | undefined =
    statusParam === 'all'
      ? undefined
      : statusParam && VALID_STATUSES.includes(statusParam as StudentStatus)
        ? (statusParam as StudentStatus)
        : 'ACTIVE'

  const centerFilter = params.centerId?.trim() || undefined
  const gradeRaw = params.grade?.trim()
  const gradeFilter =
    gradeRaw && /^\d+$/.test(gradeRaw)
      ? Math.max(1, Math.min(12, Number(gradeRaw)))
      : undefined

  const page = Math.max(1, Number(params.page ?? 1))

  const where = {
    deletedAt: null as null,
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: 'insensitive' as const } },
            { parentName: { contains: q, mode: 'insensitive' as const } },
            { parentPhone: { contains: q } },
            { studentCode: { contains: q, mode: 'insensitive' as const } },
          ],
        }
      : {}),
    ...(statusFilter ? { status: statusFilter } : {}),
    ...(centerFilter ? { preferredCenterId: centerFilter } : {}),
    ...(gradeFilter ? { currentGrade: gradeFilter } : {}),
  }

  const [students, total, centers] = await Promise.all([
    db.student.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        name: true,
        studentCode: true,
        avatarUrl: true,
        phone: true,
        currentGrade: true,
        status: true,
        parentName: true,
        parentPhone: true,
        createdAt: true,
        preferredCenter: { select: { name: true } },
        center: { select: { name: true } },
      },
    }).catch(() => []),
    db.student.count({ where }).catch(() => 0),
    db.center
      .findMany({
        where: { isActive: true },
        orderBy: { name: 'asc' },
        select: { id: true, name: true },
      })
      .catch(() => [] as Array<{ id: string; name: string }>),
  ])

  const totalPages = Math.ceil(total / PAGE_SIZE)

  // build query string preserving filters
  function pageUrl(p: number) {
    const sp = new URLSearchParams()
    if (q) sp.set('q', q)
    if (statusParam && statusParam !== 'ACTIVE') sp.set('status', statusParam)
    if (centerFilter) sp.set('centerId', centerFilter)
    if (gradeFilter) sp.set('grade', String(gradeFilter))
    if (p > 1) sp.set('page', String(p))
    const s = sp.toString()
    return s ? `?${s}` : ''
  }

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Học viên</h1>
          <p className="mt-1 text-sm text-gray-500">
            {total > 0 ? `Tổng ${total} học viên` : 'Chưa có học viên nào'}
          </p>
        </div>
        {canCreate && (
          <div className="flex gap-2">
            <Link
              href="/admin/students/new"
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#7C3AED] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:opacity-90"
            >
              <Plus className="h-4 w-4" />
              Thêm học viên
            </Link>
            <Link
              href="/admin/students/import"
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
            >
              <FileSpreadsheet className="h-4 w-4" />
              Import Excel
            </Link>
          </div>
        )}
      </div>

      {/* Filters */}
      <form method="GET" className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <input
          name="q"
          defaultValue={q}
          placeholder="Tên / mã / phụ huynh / SĐT phụ huynh..."
          className="lg:col-span-2 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[#7C3AED] focus:outline-none focus:ring-2 focus:ring-[#7C3AED]/20"
        />
        <select
          name="status"
          defaultValue={statusParam ?? 'ACTIVE'}
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[#7C3AED] focus:outline-none"
        >
          <option value="ACTIVE">Đang học</option>
          <option value="PAUSED">Bảo lưu</option>
          <option value="GRADUATED">Hoàn thành</option>
          <option value="INACTIVE">Nghỉ học</option>
          <option value="all">Tất cả trạng thái</option>
        </select>
        <select
          name="centerId"
          defaultValue={centerFilter ?? ''}
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
          defaultValue={gradeFilter ? String(gradeFilter) : ''}
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
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Ảnh</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Học viên</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Lớp</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Phụ huynh</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Cơ sở mong muốn</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Trạng thái</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Ngày tạo</th>
                {canUpdate && (
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">Hành động</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {students.length === 0 ? (
                <tr>
                  <td colSpan={canUpdate ? 8 : 7} className="px-4 py-12 text-center text-sm text-gray-400">
                    Chưa có học viên nào
                  </td>
                </tr>
              ) : (
                students.map((s) => {
                  const statusInfo = STATUS_INFO[s.status] ?? {
                    label: s.status,
                    color: 'bg-gray-100 text-gray-500',
                  }
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
                        <div className="font-medium text-gray-900">{s.name}</div>
                        {s.studentCode && (
                          <div className="text-xs text-gray-400 tabular-nums">{s.studentCode}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 tabular-nums">
                        {s.currentGrade ? `Lớp ${s.currentGrade}` : '—'}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        <div>{s.parentName ?? '—'}</div>
                        {s.parentPhone && (
                          <div className="text-xs text-gray-400 tabular-nums">{s.parentPhone}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {s.preferredCenter?.name ?? s.center?.name ?? '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusInfo.color}`}>
                          {statusInfo.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm tabular-nums text-gray-500">{formatDate(s.createdAt)}</td>
                      {canUpdate && (
                        <td className="px-4 py-3 text-right">
                          <Link
                            href={`/admin/students/${s.id}/edit`}
                            className="rounded-md border border-gray-200 px-2.5 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                          >
                            Sửa
                          </Link>
                        </td>
                      )}
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm text-gray-500">
          <span>Trang {page}/{totalPages} · {total} học viên</span>
          <div className="flex gap-2">
            {page > 1 && (
              <a href={pageUrl(page - 1)} className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm hover:bg-gray-50">
                ← Trước
              </a>
            )}
            {page < totalPages && (
              <a href={pageUrl(page + 1)} className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm hover:bg-gray-50">
                Sau →
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
