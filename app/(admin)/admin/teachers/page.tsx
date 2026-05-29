import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { can } from '@/lib/auth/permissions'
import { Role } from '@prisma/client'

function formatDate(date: Date) {
  return new Date(date).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

interface SearchParams {
  searchParams: Promise<{ q?: string }>
}

export default async function TeachersPage({ searchParams }: SearchParams) {
  const session = await auth()
  if (!session?.user) redirect('/login')
  if (!can(session.user, 'employees:view-all')) redirect('/dashboard')

  const params = await searchParams
  const q = params.q?.trim()

  // FIX 2 — Trang Giáo viên CHỈ liệt kê user role = TEACHER. Xem toàn bộ nhân sự
  // mọi vai trò là việc của trang Nhân sự (/nhan-su).
  const where = {
    isActive: true,
    deletedAt: null as null,
    role: 'TEACHER' as Role,
    ...(q ? {
      OR: [
        { name: { contains: q, mode: 'insensitive' as const } },
        { email: { contains: q, mode: 'insensitive' as const } },
      ],
    } : {}),
  }

  let staff: Array<{
    id: string
    name: string | null
    email: string
    role: Role
    createdAt: Date
    center: { name: string } | null
    teacherClass: { id: string; name: string }[]
  }> = []

  try {
    staff = await db.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
        center: { select: { name: true } },
        teacherClass: {
          where: { isActive: true, deletedAt: null },
          select: { id: true, name: true },
        },
      },
    })
  } catch { /* empty DB returns [] */ }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Giáo viên</h1>
        <p className="mt-1 text-sm text-gray-500">
          {staff.length} giáo viên · Quản lý toàn bộ nhân sự ở mục{' '}
          <a href="/nhan-su" className="font-medium text-[#7C3AED] hover:underline">Nhân sự</a>
        </p>
      </div>

      {/* Filters */}
      <form method="GET" className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          name="q"
          defaultValue={q}
          placeholder="Tìm theo tên, email..."
          className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm sm:max-w-xs focus:border-[#7C3AED] focus:outline-none focus:ring-2 focus:ring-[#7C3AED]/20"
        />
        <button type="submit" className="rounded-lg bg-[#7C3AED] px-4 py-2 text-sm font-semibold text-white hover:opacity-90">
          Tìm
        </button>
      </form>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-100">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Tên</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Email</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Cơ sở</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Lớp đang dạy</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Ngày tạo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {staff.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-sm text-gray-400">Chưa có giáo viên nào</td>
                </tr>
              ) : (
                staff.map((u) => (
                  <tr key={u.id} className="hover:bg-gray-50/60">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#F97316] to-[#7C3AED] text-xs font-bold text-white">
                          {(u.name ?? u.email)[0].toUpperCase()}
                        </div>
                        <span className="font-medium text-gray-900">{u.name ?? '—'}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">{u.email}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">{u.center?.name ?? '—'}</td>
                    <td className="px-4 py-3">
                      {u.teacherClass.length === 0 ? (
                        <span className="text-sm text-gray-400">Chưa có lớp</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {u.teacherClass.slice(0, 2).map((cls) => (
                            <span key={cls.id} className="rounded-md bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                              {cls.name}
                            </span>
                          ))}
                          {u.teacherClass.length > 2 && (
                            <span className="text-xs text-gray-400">+{u.teacherClass.length - 2}</span>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm tabular-nums text-gray-500">{formatDate(u.createdAt)}</td>
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
