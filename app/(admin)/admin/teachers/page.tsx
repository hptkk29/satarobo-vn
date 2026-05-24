import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { can } from '@/lib/auth/permissions'
import { Role } from '@prisma/client'

const ROLE_LABELS: Record<Role, string> = {
  SUPER_ADMIN: 'Super Admin',
  MANAGER: 'Quản lý',
  HR: 'Nhân sự (HR)',
  SALES: 'Sales',
  TEACHER: 'Giáo viên',
  MARKETING: 'Marketing',
  ACCOUNTANT: 'Kế toán',
}

const ROLE_COLORS: Record<Role, string> = {
  SUPER_ADMIN: 'bg-red-100 text-red-700',
  MANAGER: 'bg-purple-100 text-purple-700',
  HR: 'bg-pink-100 text-pink-700',
  SALES: 'bg-blue-100 text-blue-700',
  TEACHER: 'bg-green-100 text-green-700',
  MARKETING: 'bg-orange-100 text-orange-700',
  ACCOUNTANT: 'bg-gray-100 text-gray-600',
}

const VALID_ROLES = Object.values(Role)

function formatDate(date: Date) {
  return new Date(date).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

interface SearchParams {
  searchParams: Promise<{ q?: string; role?: string }>
}

export default async function TeachersPage({ searchParams }: SearchParams) {
  const session = await auth()
  if (!session?.user) redirect('/login')
  if (!can(session.user, 'employees:view-all')) redirect('/dashboard')

  const params = await searchParams
  const q = params.q?.trim()
  const roleParam = params.role
  const roleFilter = roleParam && VALID_ROLES.includes(roleParam as Role)
    ? (roleParam as Role)
    : undefined

  const where = {
    isActive: true,
    deletedAt: null as null,
    ...(q ? {
      OR: [
        { name: { contains: q, mode: 'insensitive' as const } },
        { email: { contains: q, mode: 'insensitive' as const } },
      ],
    } : {}),
    ...(roleFilter ? { role: roleFilter } : {}),
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

  const roles = VALID_ROLES.filter((r) => r !== 'SUPER_ADMIN')

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Nhân sự</h1>
        <p className="mt-1 text-sm text-gray-500">{staff.length} thành viên</p>
      </div>

      {/* Filters */}
      <form method="GET" className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          name="q"
          defaultValue={q}
          placeholder="Tìm theo tên, email..."
          className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm sm:max-w-xs focus:border-[#7C3AED] focus:outline-none focus:ring-2 focus:ring-[#7C3AED]/20"
        />
        <select
          name="role"
          defaultValue={roleFilter ?? ''}
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[#7C3AED] focus:outline-none"
        >
          <option value="">Tất cả vai trò</option>
          {roles.map((r) => (
            <option key={r} value={r}>{ROLE_LABELS[r]}</option>
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
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Tên</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Email</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Vai trò</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Cơ sở</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Lớp đang dạy</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Ngày tạo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {staff.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-sm text-gray-400">Chưa có nhân sự nào</td>
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
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${ROLE_COLORS[u.role]}`}>
                        {ROLE_LABELS[u.role]}
                      </span>
                    </td>
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
