import Link from 'next/link'
import { FileSpreadsheet, Plus } from 'lucide-react'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { hasPermission } from '@/lib/permissions'
import { ClassStatus, type Prisma } from '@prisma/client'

const STATUS_INFO: Record<ClassStatus, { label: string; color: string }> = {
  PLANNED: { label: 'Đang lên KH', color: 'bg-gray-100 text-gray-700' },
  RECRUITING: { label: 'Tuyển sinh', color: 'bg-amber-100 text-amber-700' },
  ACTIVE: { label: 'Đang dạy', color: 'bg-green-100 text-green-700' },
  COMPLETED: { label: 'Hoàn thành', color: 'bg-blue-100 text-blue-700' },
  CANCELLED: { label: 'Huỷ', color: 'bg-red-100 text-red-700' },
}

const DAY_LABELS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']

function formatDate(date: Date | null) {
  if (!date) return '—'
  return new Date(date).toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

function ScheduleBadge({
  days,
  startTime,
  endTime,
}: {
  days: number[]
  startTime: string | null
  endTime: string | null
}) {
  if (!days || days.length === 0) return <span className="text-gray-400">—</span>
  const daysText = [...days]
    .sort((a, b) => a - b)
    .map((d) => DAY_LABELS[d] ?? '')
    .filter(Boolean)
    .join(' · ')
  const time = startTime && endTime ? `${startTime}–${endTime}` : ''
  return (
    <span className="text-xs">
      <span className="font-medium">{daysText}</span>
      {time && <span className="ml-1 text-gray-500">{time}</span>}
    </span>
  )
}

const VALID_STATUSES = Object.values(ClassStatus)

interface SearchParams {
  searchParams: Promise<{
    q?: string
    status?: string
    centerId?: string
    courseId?: string
    teacherId?: string
  }>
}

export default async function ClassesPage({ searchParams }: SearchParams) {
  const session = await auth()
  if (!session?.user) redirect('/login')
  if (!hasPermission(session.user, 'read', 'class')) redirect('/admin/dashboard')

  const canCreate = hasPermission(session.user, 'create', 'class')
  const canUpdate = hasPermission(session.user, 'update', 'class')

  const params = await searchParams
  const q = params.q?.trim() || undefined
  const statusFilter =
    params.status && VALID_STATUSES.includes(params.status as ClassStatus)
      ? (params.status as ClassStatus)
      : undefined
  const centerFilter = params.centerId?.trim() || undefined
  const courseFilter = params.courseId?.trim() || undefined
  const teacherFilter = params.teacherId?.trim() || undefined

  const baseWhere: Prisma.ClassWhereInput = {
    deletedAt: null,
    ...(statusFilter ? { status: statusFilter } : {}),
    ...(centerFilter ? { centerId: centerFilter } : {}),
    ...(courseFilter ? { courseId: courseFilter } : {}),
  }
  const andClauses: Prisma.ClassWhereInput[] = []
  if (teacherFilter) {
    andClauses.push({
      OR: [{ teacherId: teacherFilter }, { assistantId: teacherFilter }],
    })
  }
  if (q) {
    andClauses.push({
      OR: [
        { name: { contains: q, mode: 'insensitive' } },
        { classCode: { contains: q, mode: 'insensitive' } },
      ],
    })
  }
  const where: Prisma.ClassWhereInput =
    andClauses.length > 0 ? { ...baseWhere, AND: andClauses } : baseWhere

  const [classes, centers, courses, teachers] = await Promise.all([
    db.class
      .findMany({
        where,
        orderBy: [{ status: 'asc' }, { startDate: 'desc' }, { createdAt: 'desc' }],
        select: {
          id: true,
          classCode: true,
          name: true,
          status: true,
          startDate: true,
          scheduleDays: true,
          startTime: true,
          endTime: true,
          maxStudents: true,
          course: { select: { name: true } },
          center: { select: { name: true } },
          room: { select: { code: true } },
          teacher: { select: { name: true } },
          _count: { select: { enrollments: true } },
        },
      })
      .catch(() => []),
    db.center
      .findMany({
        where: { isActive: true },
        orderBy: { displayOrder: 'asc' },
        select: { id: true, name: true },
      })
      .catch(() => [] as Array<{ id: string; name: string }>),
    db.course
      .findMany({
        where: { isActive: true },
        orderBy: { name: 'asc' },
        select: { id: true, name: true },
      })
      .catch(() => [] as Array<{ id: string; name: string }>),
    db.user
      .findMany({
        where: {
          deletedAt: null,
          isActive: true,
          role: { in: ['TEACHER', 'MANAGER'] },
        },
        orderBy: { name: 'asc' },
        select: { id: true, name: true },
      })
      .catch(() => [] as Array<{ id: string; name: string | null }>),
  ])

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Lớp học</h1>
          <p className="mt-1 text-sm text-gray-500">
            {classes.length > 0 ? `${classes.length} lớp` : 'Chưa có lớp nào'}
          </p>
        </div>
        {canCreate && (
          <div className="flex gap-2">
            <Link
              href="/admin/classes/new"
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#7C3AED] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:opacity-90"
            >
              <Plus className="h-4 w-4" />
              Thêm lớp
            </Link>
            <Link
              href="/admin/classes/import"
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
            >
              <FileSpreadsheet className="h-4 w-4" />
              Import Excel
            </Link>
          </div>
        )}
      </div>

      {/* Filters */}
      <form
        method="GET"
        className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6"
      >
        <input
          name="q"
          defaultValue={q}
          placeholder="Tìm tên / mã lớp..."
          className="lg:col-span-2 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[#7C3AED] focus:outline-none focus:ring-2 focus:ring-[#7C3AED]/20"
        />
        <select
          name="status"
          defaultValue={statusFilter ?? ''}
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
          name="courseId"
          defaultValue={courseFilter ?? ''}
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[#7C3AED] focus:outline-none"
        >
          <option value="">Tất cả khoá</option>
          {courses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          name="teacherId"
          defaultValue={teacherFilter ?? ''}
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[#7C3AED] focus:outline-none"
        >
          <option value="">Tất cả GV</option>
          {teachers.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name ?? '(chưa đặt tên)'}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="rounded-lg bg-[#7C3AED] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 sm:col-span-2 lg:col-span-6"
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
                  Tên lớp
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Khoá học
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Cơ sở / Phòng
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Lịch
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  GV chính
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Sức chứa
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Khai giảng
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Trạng thái
                </th>
                {canUpdate && (
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Hành động
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {classes.length === 0 ? (
                <tr>
                  <td
                    colSpan={canUpdate ? 9 : 8}
                    className="px-4 py-12 text-center text-sm text-gray-400"
                  >
                    Chưa có lớp nào
                  </td>
                </tr>
              ) : (
                classes.map((cls) => {
                  const statusInfo =
                    STATUS_INFO[cls.status] ?? {
                      label: cls.status,
                      color: 'bg-gray-100 text-gray-500',
                    }
                  return (
                    <tr key={cls.id} className="hover:bg-gray-50/60">
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900">{cls.name}</div>
                        {cls.classCode && (
                          <div className="text-xs text-gray-400 tabular-nums">
                            {cls.classCode}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 max-w-[160px] truncate">
                        {cls.course?.name ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        <div>{cls.center?.name ?? '—'}</div>
                        {cls.room?.code && (
                          <div className="text-xs text-gray-400">P. {cls.room.code}</div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <ScheduleBadge
                          days={cls.scheduleDays ?? []}
                          startTime={cls.startTime}
                          endTime={cls.endTime}
                        />
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {cls.teacher?.name ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-sm tabular-nums text-gray-700 font-semibold">
                        {cls._count.enrollments}/{cls.maxStudents}
                      </td>
                      <td className="px-4 py-3 text-sm tabular-nums text-gray-500">
                        {formatDate(cls.startDate)}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusInfo.color}`}
                        >
                          {statusInfo.label}
                        </span>
                      </td>
                      {canUpdate && (
                        <td className="px-4 py-3 text-right">
                          <Link
                            href={`/admin/classes/${cls.id}/edit`}
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
    </div>
  )
}
