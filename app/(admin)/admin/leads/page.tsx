import Link from 'next/link'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { can } from '@/lib/auth/permissions'
import { LeadsTable } from './_components/leads-table'
import type { LeadRow } from './_components/leads-table'
import { LeadsKanban, type KanbanLead } from './_components/leads-kanban'
import { ALL_LEAD_STATUSES } from '@/lib/leads/status'
import type { LeadStatus, Prisma } from '@prisma/client'

const PAGE_SIZE = 20
const KANBAN_LIMIT = 500

function maskPhone(phone: string): string {
  if (phone.length < 6) return phone
  const keep = 2
  const masked = phone.length - keep * 2
  return phone.slice(0, keep) + 'x'.repeat(masked) + phone.slice(-keep)
}

type SP = {
  page?: string
  status?: string
  q?: string
  view?: string
  centerId?: string
  assignedToId?: string
  source?: string
  dateFrom?: string
  dateTo?: string
}

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<SP>
}) {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const canViewAll = can(session.user, 'leads:view-all')
  const canCreate = can(session.user, 'leads:create')
  const canViewOwn = can(session.user, 'leads:view-own')
  if (!canViewAll && !canViewOwn) redirect('/dashboard')

  // SALES_CSM (chỉ view-own) → scope về lead của chính mình.
  const scopeToSelf = !canViewAll && canViewOwn

  const params = await searchParams
  const view = params.view === 'kanban' ? 'kanban' : 'table'
  const page = Math.max(1, Number(params.page ?? 1))
  const statusParam = params.status as LeadStatus | undefined
  const q = params.q?.trim()
  const statusFilter =
    statusParam && ALL_LEAD_STATUSES.includes(statusParam)
      ? statusParam
      : undefined

  const filterCenter = params.centerId?.trim() || undefined
  const filterAssignedTo = params.assignedToId?.trim() || undefined
  const filterSource = params.source?.trim() || undefined
  const dateFrom = params.dateFrom?.trim() || undefined
  const dateTo = params.dateTo?.trim() || undefined

  const createdAt: Prisma.DateTimeFilter | undefined =
    dateFrom || dateTo
      ? {
          ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
          ...(dateTo ? { lte: new Date(`${dateTo}T23:59:59`) } : {}),
        }
      : undefined

  const where: Prisma.LeadWhereInput = {
    deletedAt: null,
    ...(scopeToSelf ? { assignedToId: session.user.id } : {}),
    ...(filterAssignedTo && canViewAll
      ? { assignedToId: filterAssignedTo }
      : {}),
    ...(filterCenter ? { centerId: filterCenter } : {}),
    ...(filterSource ? { source: { contains: filterSource, mode: 'insensitive' } } : {}),
    ...(createdAt ? { createdAt } : {}),
    // Kanban hiển thị mọi cột → bỏ qua status filter ở view kanban.
    ...(statusFilter && view === 'table' ? { status: statusFilter } : {}),
    ...(q
      ? {
          OR: [
            { parentName: { contains: q, mode: 'insensitive' as const } },
            { phone: { contains: q } },
            { childName: { contains: q, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  }

  const isMarketing = session.user.role === 'MARKETING'
  const canCloseDeal =
    can(session.user, 'students:create') && can(session.user, 'enrollments:create')
  const canAssign = can(session.user, 'leads:assign')

  // Filter dropdown data (chỉ cần cho role view-all).
  const [centers, sales] = canViewAll
    ? await Promise.all([
        db.center.findMany({
          where: { isActive: true },
          select: { id: true, name: true },
          orderBy: { displayOrder: 'asc' },
        }),
        db.user.findMany({
          where: { isActive: true, deletedAt: null, role: 'SALES_CSM' },
          select: { id: true, name: true },
          orderBy: { name: 'asc' },
        }),
      ])
    : [[], []]

  if (view === 'kanban') {
    const nowTs = new Date()
    const rawLeads = await db.lead.findMany({
      where,
      include: {
        course: { select: { name: true } },
        assignedTo: { select: { name: true } },
        // T1.2 — phát hiện quá hạn: có task OPEN dueAt < now.
        tasks: {
          where: { status: 'OPEN', dueAt: { lt: nowTs } },
          select: { id: true },
          take: 1,
        },
      },
      orderBy: { createdAt: 'desc' },
      take: KANBAN_LIMIT,
    })

    const canUpdate = can(session.user, 'leads:edit')
    const kanbanLeads: KanbanLead[] = rawLeads.map((l) => ({
      id: l.id,
      parentName: l.parentName,
      phone: isMarketing ? maskPhone(l.phone) : l.phone,
      childName: l.childName,
      status: l.status,
      source: l.source,
      courseName: l.course?.name ?? null,
      assignedToName: l.assignedTo?.name ?? null,
      createdAt: l.createdAt.toISOString(),
      overdue: l.tasks.length > 0,
    }))

    return (
      <div>
        <Header total={rawLeads.length} view={view} params={params} canCreate={canCreate} />
        <FilterBar
          params={params}
          centers={centers}
          sales={sales}
          canViewAll={canViewAll}
          view={view}
        />
        <LeadsKanban
          leads={kanbanLeads}
          canUpdate={canUpdate}
          canCloseDeal={canCloseDeal}
          canAssign={canAssign}
        />
      </div>
    )
  }

  // ── Table view ──
  const [rawLeads, total] = await Promise.all([
    db.lead.findMany({
      where,
      include: {
        center: { select: { name: true } },
        assignedTo: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    db.lead.count({ where }),
  ])

  const canUpdate = can(session.user, 'leads:edit')
  const canDelete = can(session.user, 'leads:delete')

  const leads: LeadRow[] = rawLeads.map((lead) => ({
    id: lead.id,
    parentName: lead.parentName,
    phone: isMarketing ? maskPhone(lead.phone) : lead.phone,
    email: lead.email,
    childName: lead.childName,
    childAge: lead.childAge,
    status: lead.status,
    source: lead.source,
    note: lead.note,
    utmSource: lead.utmSource,
    utmMedium: lead.utmMedium,
    utmCampaign: lead.utmCampaign,
    eventId: lead.eventId,
    landingPage: lead.landingPage,
    referrer: lead.referrer,
    ipAddress: lead.ipAddress,
    userAgent: lead.userAgent,
    consentMarketing: lead.consentMarketing,
    createdAt: lead.createdAt.toISOString(),
    center: lead.center,
    assignedTo: lead.assignedTo,
  }))

  return (
    <div>
      <Header total={total} view={view} params={params} canCreate={canCreate} />
      <FilterBar
        params={params}
        centers={centers}
        sales={sales}
        canViewAll={canViewAll}
        view={view}
      />
      <LeadsTable
        leads={leads}
        total={total}
        page={page}
        pageSize={PAGE_SIZE}
        canUpdate={canUpdate}
        canDelete={canDelete}
        canCloseDeal={canCloseDeal}
        currentStatus={statusFilter}
        currentQ={q}
      />
    </div>
  )
}

// ─── Header + view toggle ────────────────────────────────────────────────────
function Header({
  total,
  view,
  params,
  canCreate,
}: {
  total: number
  view: string
  params: SP
  canCreate?: boolean
}) {
  const qs = (v: 'table' | 'kanban') => {
    const u = new URLSearchParams()
    if (params.q) u.set('q', params.q)
    if (params.centerId) u.set('centerId', params.centerId)
    if (params.assignedToId) u.set('assignedToId', params.assignedToId)
    if (params.source) u.set('source', params.source)
    if (params.dateFrom) u.set('dateFrom', params.dateFrom)
    if (params.dateTo) u.set('dateTo', params.dateTo)
    u.set('view', v)
    return `/leads?${u.toString()}`
  }
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Danh sách Lead</h1>
        <p className="mt-1 text-sm text-gray-500">
          {total > 0
            ? `${view === 'kanban' ? 'Hiển thị' : 'Tổng'} ${total} lead`
            : 'Chưa có lead nào'}
        </p>
      </div>
      <div className="inline-flex overflow-hidden rounded-lg border border-gray-200">
        <Link
          href={qs('table')}
          className={`px-3 py-1.5 text-sm font-medium ${
            view === 'table'
              ? 'bg-orange-500 text-white'
              : 'bg-white text-gray-600 hover:bg-gray-50'
          }`}
        >
          Bảng
        </Link>
        <Link
          href={qs('kanban')}
          className={`px-3 py-1.5 text-sm font-medium ${
            view === 'kanban'
              ? 'bg-orange-500 text-white'
              : 'bg-white text-gray-600 hover:bg-gray-50'
          }`}
        >
          Kanban
        </Link>
      </div>
      {canCreate && (
        <div className="flex items-center gap-2">
          <Link
            href="/leads/import"
            className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Import Excel
          </Link>
          <Link
            href="/leads/new"
            className="rounded-lg bg-[#7C3AED] px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90"
          >
            + Thêm lead
          </Link>
        </div>
      )}
    </div>
  )
}

// ─── Filter bar (GET form) ─────────────────────────────────────────────────────
function FilterBar({
  params,
  centers,
  sales,
  canViewAll,
  view,
}: {
  params: SP
  centers: { id: string; name: string }[]
  sales: { id: string; name: string | null }[]
  canViewAll: boolean
  view: string
}) {
  return (
    <form
      method="GET"
      className="mb-4 flex flex-wrap items-end gap-2 rounded-lg bg-gray-50 p-3"
    >
      <input type="hidden" name="view" value={view} />
      <div>
        <label className="mb-1 block text-xs text-gray-600">Tìm</label>
        <input
          name="q"
          defaultValue={params.q ?? ''}
          placeholder="Tên / SĐT / tên con"
          className="w-48 rounded border px-2 py-1.5 text-sm"
        />
      </div>
      {canViewAll && (
        <>
          <div>
            <label className="mb-1 block text-xs text-gray-600">Cơ sở</label>
            <select
              name="centerId"
              defaultValue={params.centerId ?? ''}
              className="rounded border px-2 py-1.5 text-sm"
            >
              <option value="">Tất cả</option>
              {centers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-600">Sale</label>
            <select
              name="assignedToId"
              defaultValue={params.assignedToId ?? ''}
              className="rounded border px-2 py-1.5 text-sm"
            >
              <option value="">Tất cả</option>
              {sales.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name ?? '(chưa đặt tên)'}
                </option>
              ))}
            </select>
          </div>
        </>
      )}
      <div>
        <label className="mb-1 block text-xs text-gray-600">Nguồn</label>
        <input
          name="source"
          defaultValue={params.source ?? ''}
          placeholder="vd: sata1, lien-he"
          className="w-36 rounded border px-2 py-1.5 text-sm"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs text-gray-600">Từ ngày</label>
        <input
          type="date"
          name="dateFrom"
          defaultValue={params.dateFrom ?? ''}
          className="rounded border px-2 py-1.5 text-sm"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs text-gray-600">Đến ngày</label>
        <input
          type="date"
          name="dateTo"
          defaultValue={params.dateTo ?? ''}
          className="rounded border px-2 py-1.5 text-sm"
        />
      </div>
      <button className="rounded bg-gray-800 px-3 py-1.5 text-sm font-medium text-white">
        Lọc
      </button>
      <Link
        href={`/leads?view=${view}`}
        className="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
      >
        Xoá lọc
      </Link>
    </form>
  )
}
