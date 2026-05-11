import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { hasPermission } from '@/lib/permissions'

function formatDate(date: Date | null) {
  if (!date) return '—'
  return new Date(date).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

interface SearchParams {
  searchParams: Promise<{ q?: string; active?: string }>
}

export default async function ClassesPage({ searchParams }: SearchParams) {
  const session = await auth()
  if (!session?.user) redirect('/login')
  if (!hasPermission(session.user, 'read', 'class')) redirect('/admin/dashboard')

  const params = await searchParams
  const q = params.q?.trim()
  const activeFilter = params.active // 'true' | 'false' | undefined

  const where = {
    deletedAt: null as null,
    ...(q ? { name: { contains: q, mode: 'insensitive' as const } } : {}),
    ...(activeFilter !== undefined ? { isActive: activeFilter === 'true' } : {}),
  }

  const classes = await db.class.findMany({
    where,
    orderBy: { startDate: 'desc' },
    include: {
      course: { select: { name: true } },
      center: { select: { name: true } },
      teacher: { select: { name: true } },
      _count: { select: { enrollments: true } },
    },
  }).catch(() => [])

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Lớp học</h1>
        <p className="mt-1 text-sm text-gray-500">{classes.length} lớp</p>
      </div>

      {/* Filters */}
      <form method="GET" className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          name="q"
          defaultValue={q}
          placeholder="Tìm theo tên lớp..."
          className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm sm:max-w-xs focus:border-[#7C3AED] focus:outline-none focus:ring-2 focus:ring-[#7C3AED]/20"
        />
        <select
          name="active"
          defaultValue={activeFilter ?? ''}
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[#7C3AED] focus:outline-none"
        >
          <option value="">Tất cả</option>
          <option value="true">Đang hoạt động</option>
          <option value="false">Đã đóng</option>
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
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Tên lớp</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Khoá học</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Giáo viên</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Cơ sở</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Học viên</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Khai giảng</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Trạng thái</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {classes.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-sm text-gray-400">Chưa có lớp nào</td>
                </tr>
              ) : (
                classes.map((cls) => (
                  <tr key={cls.id} className="hover:bg-gray-50/60">
                    <td className="px-4 py-3 font-medium text-gray-900">{cls.name}</td>
                    <td className="px-4 py-3 text-sm text-gray-600 max-w-[160px] truncate">{cls.course?.name ?? '—'}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{cls.teacher?.name ?? '—'}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">{cls.center?.name ?? '—'}</td>
                    <td className="px-4 py-3 text-sm tabular-nums text-gray-700 font-semibold">
                      {cls._count.enrollments}/{cls.maxStudents}
                    </td>
                    <td className="px-4 py-3 text-sm tabular-nums text-gray-500">{formatDate(cls.startDate)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${cls.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {cls.isActive ? 'Đang hoạt động' : 'Đã đóng'}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
