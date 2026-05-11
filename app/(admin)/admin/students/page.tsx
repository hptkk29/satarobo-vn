import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { hasPermission } from '@/lib/permissions'
import { EnrollmentStatus } from '@prisma/client'

const ENROLLMENT_STATUS: Record<EnrollmentStatus, { label: string; color: string }> = {
  ACTIVE: { label: 'Đang học', color: 'bg-green-100 text-green-700' },
  PAUSED: { label: 'Tạm dừng', color: 'bg-yellow-100 text-yellow-700' },
  COMPLETED: { label: 'Hoàn thành', color: 'bg-blue-100 text-blue-700' },
  CANCELLED: { label: 'Đã huỷ', color: 'bg-gray-100 text-gray-500' },
}

function formatDate(date: Date) {
  return new Date(date).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

interface SearchParams {
  searchParams: Promise<{ q?: string; status?: string; page?: string }>
}

const PAGE_SIZE = 20
const VALID_STATUSES = Object.values(EnrollmentStatus)

export default async function StudentsPage({ searchParams }: SearchParams) {
  const session = await auth()
  if (!session?.user) redirect('/login')
  if (!hasPermission(session.user, 'read', 'student')) redirect('/admin/dashboard')

  const params = await searchParams
  const q = params.q?.trim()
  const statusParam = params.status
  const statusFilter = statusParam && VALID_STATUSES.includes(statusParam as EnrollmentStatus)
    ? (statusParam as EnrollmentStatus)
    : undefined
  const page = Math.max(1, Number(params.page ?? 1))

  const where = {
    deletedAt: null as null,
    ...(q ? {
      OR: [
        { name: { contains: q, mode: 'insensitive' as const } },
        { phone: { contains: q } },
        { parentName: { contains: q, mode: 'insensitive' as const } },
      ],
    } : {}),
    ...(statusFilter ? { enrollments: { some: { status: statusFilter } } } : {}),
  }

  const [students, total] = await Promise.all([
    db.student.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        name: true,
        phone: true,
        parentName: true,
        createdAt: true,
        center: { select: { name: true } },
        enrollments: {
          select: { status: true, course: { select: { name: true } } },
          take: 1,
          orderBy: { createdAt: 'desc' },
        },
      },
    }).catch(() => []),
    db.student.count({ where }).catch(() => 0),
  ])

  const totalPages = Math.ceil(total / PAGE_SIZE)

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Học viên</h1>
        <p className="mt-1 text-sm text-gray-500">{total > 0 ? `Tổng ${total} học viên` : 'Chưa có học viên nào'}</p>
      </div>

      {/* Filters */}
      <form method="GET" className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          name="q"
          defaultValue={q}
          placeholder="Tìm theo tên, SĐT, phụ huynh..."
          className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm sm:max-w-xs focus:border-[#7C3AED] focus:outline-none focus:ring-2 focus:ring-[#7C3AED]/20"
        />
        <select
          name="status"
          defaultValue={statusFilter ?? ''}
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[#7C3AED] focus:outline-none"
        >
          <option value="">Tất cả trạng thái</option>
          {Object.entries(ENROLLMENT_STATUS).map(([v, { label }]) => (
            <option key={v} value={v}>{label}</option>
          ))}
        </select>
        <button type="submit" className="rounded-lg bg-[#7C3AED] px-4 py-2 text-sm font-semibold text-white hover:opacity-90">
          Tìm
        </button>
      </form>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-100">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Học viên</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Phụ huynh</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Khoá học</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Trạng thái</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Cơ sở</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Ngày vào</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {students.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-sm text-gray-400">Chưa có học viên nào</td>
                </tr>
              ) : (
                students.map((s) => {
                  const enrollment = s.enrollments[0]
                  const statusInfo = enrollment
                    ? (ENROLLMENT_STATUS[enrollment.status] ?? { label: enrollment.status, color: 'bg-gray-100 text-gray-500' })
                    : null
                  return (
                    <tr key={s.id} className="hover:bg-gray-50/60">
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900">{s.name}</div>
                        {s.phone && <div className="text-xs text-gray-400 tabular-nums">{s.phone}</div>}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">{s.parentName ?? '—'}</td>
                      <td className="px-4 py-3 text-sm text-gray-600 max-w-[160px] truncate">
                        {enrollment?.course?.name ?? '—'}
                      </td>
                      <td className="px-4 py-3">
                        {statusInfo ? (
                          <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusInfo.color}`}>
                            {statusInfo.label}
                          </span>
                        ) : '—'}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">{s.center?.name ?? '—'}</td>
                      <td className="px-4 py-3 text-sm tabular-nums text-gray-500">{formatDate(s.createdAt)}</td>
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
              <a href={`?page=${page - 1}${q ? `&q=${q}` : ''}${statusFilter ? `&status=${statusFilter}` : ''}`}
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm hover:bg-gray-50">
                ← Trước
              </a>
            )}
            {page < totalPages && (
              <a href={`?page=${page + 1}${q ? `&q=${q}` : ''}${statusFilter ? `&status=${statusFilter}` : ''}`}
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm hover:bg-gray-50">
                Sau →
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
