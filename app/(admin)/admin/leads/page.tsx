import Link from 'next/link'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { scopedDb } from '@/lib/db-scope'
import { resolveActor } from '@/lib/auth/actor'
import { checkPermission, checkPermissionDetail } from '@/lib/auth/check-permission'
import { maskLeadPiiFields } from '@/lib/lead/pii'
import { canViewLeadPii } from '@/lib/auth/check-permission'
import { LeadsTable } from './_components/leads-table'
import type { LeadRow } from './_components/leads-table'
import { LeadsKanban, type KanbanLead } from './_components/leads-kanban'
import { ALL_LEAD_STATUSES } from '@/lib/leads/status'
import type { LeadStatus, Prisma } from '@prisma/client'
import { phoneSearchTerm } from '@/lib/phone'
import { getNonEnrollableCenterIds } from '@/lib/enrollment-flow'

const PAGE_SIZE = 20
const KANBAN_LIMIT = 500

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

export const metadata = { title: 'Leads | Admin' }

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<SP>
}) {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const canViewAll = (await checkPermission('leads:view-all'))
  const canCreate = (await checkPermission('leads:create'))
  const canViewOwn = (await checkPermission('leads:view-own'))
  if (!canViewAll && !canViewOwn) redirect('/dashboard')

  // SALES_CSM (chỉ view-own) → scope về lead của chính mình.
  const scopeToSelf = !canViewAll && canViewOwn

  // Cách ly cơ sở: Lead ∈ SCOPED_MODELS → sdb.lead tự inject `centerId IN visible`.
  // CENTER_MANAGER@CS1 không thấy lead CS2 (kể cả khi tự set filterCenter=CS2 → giao
  // tập rỗng). SUPER_ADMIN/HO bypass (ALL). Center/User không scoped — sdb = db.
  const actor = await resolveActor(session.user.id)
  const sdb = scopedDb(actor)

  const params = await searchParams
  const view = params.view === 'kanban' ? 'kanban' : 'table'
  const page = Math.max(1, Number(params.page ?? 1))
  const statusParam = params.status as LeadStatus | undefined
  const q = params.q?.trim()
  // SĐT lưu 2 dạng (0… cũ / 84… mới) — tìm theo phần lõi để không sót. Xem lib/phone.ts.
  const qPhone = q ? (phoneSearchTerm(q) ?? q) : q
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

  // #11 T2 — mask PII lead (SĐT/email/tên PH-HS/note) ở SERVER cho actor không có
  // quyền leads:view-pii — chặn leak qua RSC payload, không chỉ che UI.
  // ⚠️ Không lấy MARKETING làm ví dụ nữa: từ 21/07 MARKETING CÓ leads:view-pii.
  // Hiện mọi vai vào được trang này đều có quyền, nên nhánh mask chỉ chạy khi
  // admin thu quyền của một người cụ thể qua UserPermissionGrant (DENY).
  const canViewPii = await canViewLeadPii()
  // NỢ #11 (search-oracle): chỉ cho tìm theo SĐT khi actor thấy được SĐT thật —
  // PII lead do leads:view-pii cai quản (canViewPii VÀ không bị DENY cấp trường
  // "phone" TS-02). Thiếu quyền mà vẫn filter theo SĐT = dò được số qua kết quả.
  const { fieldMask: leadPiiMask } = await checkPermissionDetail('leads:view-pii')
  const canSearchPhone = canViewPii && !leadPiiMask.includes('phone')

  // Base filter (không kèm status) — dùng cho query chính (thêm status tuỳ view)
  // + đếm badge tab "Đã đăng ký" (luôn đếm trên scope hiện tại, bất kể view/status filter).
  const baseWhere: Prisma.LeadWhereInput = {
    deletedAt: null,
    // SHARE T1 — sale view-own thấy lead của mình HOẶC lead team đã bật "dùng chung".
    // Gói trong AND để không đè key OR của search q bên dưới (2 OR sống chung).
    // Cách ly cơ sở vẫn do scopedDb inject centerId — share không xuyên cơ sở.
    ...(scopeToSelf
      ? {
          AND: [
            {
              OR: [
                { assignedToId: session.user.id },
                { isSharedWithTeam: true },
              ],
            },
          ],
        }
      : {}),
    ...(filterAssignedTo && canViewAll
      ? { assignedToId: filterAssignedTo }
      : {}),
    ...(filterCenter ? { centerId: filterCenter } : {}),
    ...(filterSource ? { source: { contains: filterSource, mode: 'insensitive' } } : {}),
    ...(createdAt ? { createdAt } : {}),
    ...(q
      ? {
          OR: [
            { parentName: { contains: q, mode: 'insensitive' as const } },
            // Lead.phone = SĐT PH — chỉ tìm được khi thấy SĐT thật (NỢ #11).
            ...(canSearchPhone ? [{ phone: { contains: qPhone } }] : []),
            { childName: { contains: q, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  }

  const where: Prisma.LeadWhereInput = {
    ...baseWhere,
    // Kanban hiển thị mọi cột → bỏ qua status filter ở view kanban.
    ...(statusFilter && view === 'table' ? { status: statusFilter } : {}),
  }

  // NHÓM 03 — Việc 2: đếm lead REGISTERED (đã đăng ký, chưa convert) cho tab preset.
  const registeredCount = await sdb.lead.count({
    where: { ...baseWhere, status: 'REGISTERED' },
  })

  const canCloseDeal =
    (await checkPermission('students:create')) && (await checkPermission('enrollments:create'))
  const canAssign = (await checkPermission('leads:assign'))

  // Filter dropdown data (chỉ cần cho role view-all).
  // Hội sở KHÔNG bao giờ có lead (chốt 04/08) → để trong ô lọc là lựa chọn luôn ra
  // rỗng, người dùng tưởng mất dữ liệu. Nhận diện qua cây OrgUnit, không hardcode.
  const nonEnrollable = await getNonEnrollableCenterIds()
  const [centers, sales] = canViewAll
    ? await Promise.all([
        sdb.center
          .findMany({
            where: { isActive: true },
            select: { id: true, name: true },
            orderBy: { displayOrder: 'asc' },
          })
          .then((cs) => cs.filter((c) => !nonEnrollable.includes(c.id))),
        sdb.user.findMany({
          where: { isActive: true, deletedAt: null, roles: { has: 'SALES_CSM' } },
          select: { id: true, name: true },
          orderBy: { name: 'asc' },
        }),
      ])
    : [[], []]

  if (view === 'kanban') {
    const nowTs = new Date()
    const rawLeads = await sdb.lead.findMany({
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
        // FL-R2 (item 6/TR-4) — lần học thử gần nhất (giữ kể cả khi lead quay lại pipeline).
        children: {
          select: {
            trialHistory: {
              where: { attendedCount: { gt: 0 } },
              select: { lastAttendedAt: true },
              orderBy: { lastAttendedAt: 'desc' },
              take: 1,
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: KANBAN_LIMIT,
    })

    // Tổng thật để nhãn "Tổng N lead" khớp với view bảng. Chỉ đếm thêm khi đã chạm trần
    // (dưới trần thì số card hiển thị = tổng, khỏi query dư).
    const kanbanTotal =
      rawLeads.length < KANBAN_LIMIT ? rawLeads.length : await sdb.lead.count({ where })

    const canUpdate = (await checkPermission('leads:edit'))
    const kanbanLeads: KanbanLead[] = rawLeads.map((raw) => {
      // #11 T2 — mask PII (tên PH/SĐT/tên con) trước khi build payload client.
      const l = maskLeadPiiFields(raw, canViewPii)
      // ngày học thử gần nhất across mọi con.
      const trialDates = l.children
        .flatMap((c) => c.trialHistory.map((h) => h.lastAttendedAt))
        .filter((d): d is Date => d != null)
        .sort((a, b) => b.getTime() - a.getTime())
      return {
        id: l.id,
        parentName: l.parentName,
        phone: l.phone,
        childName: l.childName,
        status: l.status,
        source: l.source,
        courseName: l.course?.name ?? null,
        assignedToName: l.assignedTo?.name ?? null,
        createdAt: l.createdAt.toISOString(),
        overdue: l.tasks.length > 0,
        lastTrialDate: trialDates[0]?.toISOString() ?? null,
        // SHARE T1 — badge "Dùng chung" trên card.
        isSharedWithTeam: l.isSharedWithTeam,
        assignedToId: l.assignedToId,
      }
    })

    return (
      <div>
        <Header
          total={kanbanTotal}
          shown={rawLeads.length}
          view={view}
          params={params}
          canCreate={canCreate}
          canBulkConvert={canViewAll && canCreate}
        />
        <StatusTabs params={params} view={view} registeredCount={registeredCount} />
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
          currentUserId={session.user.id}
        />
      </div>
    )
  }

  // ── Table view ──
  const [rawLeads, total] = await Promise.all([
    sdb.lead.findMany({
      where,
      include: {
        center: { select: { name: true } },
        course: { select: { name: true } },
        assignedTo: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    sdb.lead.count({ where }),
  ])

  const canUpdate = (await checkPermission('leads:edit'))
  const canDelete = (await checkPermission('leads:delete'))

  const leads: LeadRow[] = rawLeads.map((raw) => {
    // #11 T2 — mask PII (tên PH/SĐT/email/tên con/note) trước khi build payload client.
    const lead = maskLeadPiiFields(raw, canViewPii)
    return {
      id: lead.id,
      parentName: lead.parentName,
      phone: lead.phone,
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
      courseName: lead.course?.name ?? null,
      assignedTo: lead.assignedTo,
      // SHARE T1 — badge "Dùng chung" trên bảng.
      isSharedWithTeam: lead.isSharedWithTeam,
      assignedToId: lead.assignedToId,
    }
  })

  return (
    <div>
      <Header total={total} view={view} params={params} canCreate={canCreate} canBulkConvert={canViewAll && canCreate} />
      <StatusTabs params={params} view={view} registeredCount={registeredCount} />
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
        currentStatus={statusFilter}
        currentQ={q}
        currentUserId={session.user.id}
      />
    </div>
  )
}

// ─── Header + view toggle ────────────────────────────────────────────────────
function Header({
  total,
  shown,
  view,
  params,
  canCreate,
  canBulkConvert,
}: {
  total: number
  /** Số card thực sự hiển thị ở kanban (để chú thích khi đã chạm trần). */
  shown?: number
  view: string
  params: SP
  canCreate?: boolean
  /** Nút "Chốt hàng loạt" chỉ cho manager (leads:view-all) — màn đó thấy mọi lead cơ sở. */
  canBulkConvert?: boolean
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
            ? `Tổng ${total} lead${
                view === 'kanban' && shown != null && shown < total
                  ? ` (hiển thị ${shown} mới nhất)`
                  : ''
              }`
            : 'Chưa có lead nào'}
        </p>
      </div>
      <div className="inline-flex overflow-hidden rounded-lg border border-gray-200">
        <Link
          href={qs('table')}
          className={`px-3 py-1.5 text-sm font-medium ${ view === 'table' ? 'bg-primary text-white' : 'bg-white text-gray-600 hover:bg-gray-50' }`}
        >
          Bảng
        </Link>
        <Link
          href={qs('kanban')}
          className={`px-3 py-1.5 text-sm font-medium ${ view === 'kanban' ? 'bg-primary text-white' : 'bg-white text-gray-600 hover:bg-gray-50' }`}
        >
          Kanban
        </Link>
      </div>
      {canCreate && (
        <div className="flex items-center gap-2">
          <a
            href="/api/admin/templates/leads"
            download="mau-lead.xlsx"
            className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Tải file mẫu
          </a>
          <Link
            href="/leads/import"
            className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Import Excel
          </Link>
          {canBulkConvert && (
            <Link
              href="/leads/bulk-convert"
              className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Chốt hàng loạt
            </Link>
          )}
          <Link
            href="/leads/new"
            className="rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90"
          >
            + Thêm lead
          </Link>
        </div>
      )}
    </div>
  )
}

// ─── NHÓM 03 (Việc 2) — tab preset "Đã đăng ký" (?status=REGISTERED) ──────────
function StatusTabs({
  params,
  view,
  registeredCount,
}: {
  params: SP
  view: string
  registeredCount: number
}) {
  const qs = (status?: string) => {
    const u = new URLSearchParams()
    if (params.q) u.set('q', params.q)
    if (params.centerId) u.set('centerId', params.centerId)
    if (params.assignedToId) u.set('assignedToId', params.assignedToId)
    if (params.source) u.set('source', params.source)
    if (params.dateFrom) u.set('dateFrom', params.dateFrom)
    if (params.dateTo) u.set('dateTo', params.dateTo)
    // Tab preset chỉ có ý nghĩa ở view bảng (kanban hiện mọi cột, bỏ qua status filter).
    u.set('view', 'table')
    if (status) u.set('status', status)
    return `/leads?${u.toString()}`
  }
  const isRegistered = view === 'table' && params.status === 'REGISTERED'
  const tabCls = (active: boolean) =>
    `rounded-lg px-3 py-1.5 text-sm font-medium ${
      // Tab ĐANG CHỌN là trạng thái điều hướng, không phải "thành công" — dùng màu
      // thương hiệu. Trước đây nó xanh lục, tranh nghĩa với badge trạng thái ngay
      // cạnh (DESIGN.md §1: màu ngữ nghĩa là thang RIÊNG, không mượn lẫn nhau).
      active ? 'bg-primary text-primary-foreground' : 'bg-white text-gray-600 hover:bg-gray-50'
    } border border-gray-200`

  return (
    <div className="mb-3 flex flex-wrap gap-2">
      <Link href={qs(undefined)} className={tabCls(view === 'table' && !params.status)}>
        Tất cả
      </Link>
      <Link href={qs('REGISTERED')} className={tabCls(isRegistered)}>
        Đã đăng ký{' '}
        <span
          className={`ml-1 rounded-full px-1.5 py-0.5 text-xs font-semibold ${ isRegistered ? 'bg-white/20' : 'bg-primary-soft text-primary' }`}
        >
          {registeredCount}
        </span>
      </Link>
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
  // Các input dùng `defaultValue` (uncontrolled) → React KHÔNG reset value khi điều hướng
  // client-side (vd bấm "Xoá lọc"). Đặt `key` theo bộ lọc hiện tại để form remount →
  // mọi ô nhập trả về defaultValue mới (rỗng khi đã xoá lọc). (bug: Xoá lọc còn chữ cũ)
  const filterKey = [
    params.q,
    params.centerId,
    params.assignedToId,
    params.source,
    params.dateFrom,
    params.dateTo,
  ]
    .map((v) => v ?? '')
    .join('|')
  return (
    <form
      key={filterKey}
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
