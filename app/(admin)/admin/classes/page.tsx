import Link from 'next/link'
import { CalendarCheck2, FileSpreadsheet, Plus } from 'lucide-react'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { scopedDb } from '@/lib/db-scope'
import { resolveActor } from '@/lib/auth/actor'
import { checkPermission } from '@/lib/auth/check-permission'
import { ClassStatus, type Prisma } from '@prisma/client'
import { ENROLLMENT_ACTIVE_STATUS_LIST } from '@/lib/enrollment-status'
import { getAssignableTeachers } from '@/lib/teachers/assignable'
import { ClassDeleteButton } from './_components/class-delete-button'
import { ClassFilters } from './_components/class-filters'
import { PhanTrangBang } from "@/components/ui/phan-trang-bang";

const STATUS_INFO: Record<ClassStatus, { label: string; color: string }> = {
  PLANNED: { label: 'Đang lên KH', color: 'bg-muted text-foreground' },
  RECRUITING: { label: 'Tuyển sinh', color: 'bg-state-warning-soft text-state-warning-ink' },
  PENDING_APPROVAL: { label: 'Chờ duyệt', color: 'bg-primary-soft text-primary' },
  ACTIVE: { label: 'Đang dạy', color: 'bg-state-success-soft text-state-success-ink' },
  COMPLETED: { label: 'Hoàn thành', color: 'bg-state-info-soft text-state-info-ink' },
  CANCELLED: { label: 'Huỷ', color: 'bg-state-danger-soft text-state-danger-ink' },
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
  if (!days || days.length === 0) return <span className="text-muted-foreground">—</span>
  const daysText = [...days]
    .sort((a, b) => a - b)
    .map((d) => DAY_LABELS[d] ?? '')
    .filter(Boolean)
    .join(' · ')
  const time = startTime && endTime ? `${startTime}–${endTime}` : ''
  return (
    <span className="text-xs">
      <span className="font-medium">{daysText}</span>
      {time && <span className="ml-1 text-muted-foreground">{time}</span>}
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

  const actor = await resolveActor(session.user.id)
  // 18/08 — Đào tạo vào được DANH SÁCH lớp để đi tiếp vào tab "Đánh giá & Nhận xét"
  // của từng lớp. Không có quyền này thì màn nhận xét có tồn tại cũng không ai tới được.
  // Chỉ là lối đi: nút Thêm/Sửa/Xoá vẫn gác riêng bằng classes:create/edit/delete.
  // Ba lời gọi để NGUYÊN trong điều kiện — bất biến menu≡gate (page-gates.test) đọc
  // tĩnh chính chỗ này; gán ra biến trước là gate "tàng hình" với test.
  if (
    !(await checkPermission('classes:view-all')) &&
    !(await checkPermission('classes:view-own')) &&
    !(await checkPermission('session-feedback:view-all'))
  ) {
    redirect('/dashboard')
  }

  const canCreate = await checkPermission('classes:create')
  const canUpdate = await checkPermission('classes:edit')
  const canDelete = await checkPermission('classes:delete')
  const canManage = canUpdate || canDelete

  const params = await searchParams
  const q = params.q?.trim() || undefined
  const statusFilter =
    params.status && VALID_STATUSES.includes(params.status as ClassStatus)
      ? (params.status as ClassStatus)
      : undefined
  const centerFilter = params.centerId?.trim() || undefined
  const courseFilter = params.courseId?.trim() || undefined
  const teacherFilter = params.teacherId?.trim() || undefined

  const hasViewAll = await checkPermission('classes:view-all')
  const hasViewOwn = await checkPermission('classes:view-own')
  const effectiveTeacherFilter = (!hasViewAll && hasViewOwn) ? session.user.id : teacherFilter

  const baseWhere: Prisma.ClassWhereInput = {
    deletedAt: null,
    ...(statusFilter ? { status: statusFilter } : {}),
    ...(centerFilter ? { centerId: centerFilter } : {}),
    ...(courseFilter ? { courseId: courseFilter } : {}),
  }
  const andClauses: Prisma.ClassWhereInput[] = []
  if (effectiveTeacherFilter) {
    andClauses.push({
      OR: [{ teacherId: effectiveTeacherFilter }, { assistantId: effectiveTeacherFilter }],
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
    scopedDb(actor).class
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
          _count: {
            select: {
              enrollments: { where: { status: { in: ENROLLMENT_ACTIVE_STATUS_LIST }, deletedAt: null } },
              sessions: true,
            },
          },
        },
      })
      .catch(() => []),
    scopedDb(actor).center
      .findMany({
        where: { isActive: true },
        orderBy: { displayOrder: 'asc' },
        select: { id: true, name: true },
      })
      .catch(() => [] as Array<{ id: string; name: string }>),
    scopedDb(actor).course
      .findMany({
        where: { isActive: true },
        orderBy: { name: 'asc' },
        select: { id: true, name: true },
      })
      .catch(() => [] as Array<{ id: string; name: string }>),
    // Fix #9 — bộ lọc GV dùng chung nguồn assignable (không lọt quản lý/sale thuần).
    // R2-RBAC-3 — chỉ GV thuộc cơ sở actor nhìn thấy (CS1 không lọt GV CS2 vào filter).
    // 06/08 - GV la nguon luc chung (Hoi so dieu di moi co so): KHONG loc danh
    // sach theo co so nua, neu khong CS2 khong bao gio toi duoc form va bo loc
    // phia client co mo cung vo nghia.
    getAssignableTeachers({}).catch(
      () => [] as Array<{ id: string; name: string | null }>,
    ),
  ])

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Lớp học</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {classes.length > 0 ? `${classes.length} lớp` : 'Chưa có lớp nào'}
          </p>
        </div>
        {canCreate && (
          <div className="flex gap-2">
            <Link
              href="/classes/new"
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white shadow-sm hover:opacity-90"
            >
              <Plus className="h-4 w-4" />
              Thêm lớp
            </Link>
            <Link
              href="/classes/import"
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground hover:bg-muted"
            >
              <FileSpreadsheet className="h-4 w-4" />
              Import Excel
            </Link>
            {/* 08/08 — rà soát buổi lệch ngày khai giảng (lỗi im lặng, phải chủ động soi). */}
            <Link
              href="/classes/kiem-tra-lich"
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground hover:bg-muted"
            >
              <CalendarCheck2 className="h-4 w-4" />
              Kiểm tra lịch buổi
            </Link>
          </div>
        )}
      </div>

      {/* Filters — client-side nav + pending indicator (Lỗi 1 QA 20/07) */}
      <ClassFilters
        initial={{
          q,
          status: statusFilter,
          centerId: centerFilter,
          courseId: courseFilter,
          teacherId: teacherFilter,
        }}
        statuses={Object.entries(STATUS_INFO).map(([v, { label }]) => ({
          value: v,
          label,
        }))}
        centers={centers.map((c) => ({ value: c.id, label: c.name }))}
        courses={courses.map((c) => ({ value: c.id, label: c.name }))}
        teachers={teachers.map((t) => ({
          value: t.id,
          label: t.name ?? '(chưa đặt tên)',
        }))}
      />

      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="overflow-x-auto">
          <PhanTrangBang>
            <table className="min-w-full divide-y divide-border">
              <thead className="bg-muted">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Tên lớp
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Khoá học
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Cơ sở / Phòng
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Lịch
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    GV chính
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Sức chứa
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Khai giảng
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Trạng thái
                  </th>
                  {canManage && (
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Hành động
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {classes.length === 0 ? (
                  <tr>
                    <td
                      colSpan={canManage ? 9 : 8}
                      className="px-4 py-12 text-center text-sm text-muted-foreground"
                    >
                      Chưa có lớp nào
                    </td>
                  </tr>
                ) : (
                  classes.map((cls) => {
                    const statusInfo =
                      STATUS_INFO[cls.status] ?? {
                        label: cls.status,
                        color: 'bg-muted text-muted-foreground',
                      }
                    return (
                      <tr key={cls.id} className="hover:bg-muted/60">
                        <td className="px-4 py-3">
                          <div className="font-medium text-foreground">{cls.name}</div>
                          {cls.classCode && (
                            <div className="text-xs text-muted-foreground tabular-nums">
                              {cls.classCode}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-muted-foreground max-w-[160px] truncate">
                          {cls.course?.name ?? '—'}
                        </td>
                        <td className="px-4 py-3 text-sm text-muted-foreground">
                          <div>{cls.center?.name ?? '—'}</div>
                          {cls.room?.code && (
                            <div className="text-xs text-muted-foreground">P. {cls.room.code}</div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <ScheduleBadge
                            days={cls.scheduleDays ?? []}
                            startTime={cls.startTime}
                            endTime={cls.endTime}
                          />
                        </td>
                        <td className="px-4 py-3 text-sm text-muted-foreground">
                          {cls.teacher?.name ?? '—'}
                        </td>
                        <td className="px-4 py-3 text-sm tabular-nums text-foreground font-semibold">
                          {cls._count.enrollments}/{cls.maxStudents}
                        </td>
                        <td className="px-4 py-3 text-sm tabular-nums text-muted-foreground">
                          {formatDate(cls.startDate)}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusInfo.color}`}
                          >
                            {statusInfo.label}
                          </span>
                        </td>
                        {canManage && (
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <Link
                                href={`/classes/${cls.id}`}
                                className="rounded-md border border-primary-soft px-2.5 py-1 text-xs font-semibold text-primary hover:bg-primary-soft"
                              >
                                Chi tiết
                              </Link>
                              {canUpdate && (
                                <Link
                                  href={`/classes/${cls.id}/edit`}
                                  className="rounded-md border border-border px-2.5 py-1 text-xs font-semibold text-foreground hover:bg-muted"
                                >
                                  Sửa
                                </Link>
                              )}
                              {canDelete && (
                                <ClassDeleteButton
                                  classId={cls.id}
                                  name={cls.name}
                                  enrollmentCount={cls._count.enrollments}
                                  sessionCount={cls._count.sessions}
                                />
                              )}
                            </div>
                          </td>
                        )}
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </PhanTrangBang>
        </div>
      </div>
    </div>
  )
}
