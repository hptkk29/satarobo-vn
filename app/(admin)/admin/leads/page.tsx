import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { hasPermission } from '@/lib/permissions'
import { LeadsTable } from './_components/leads-table'
import type { LeadRow } from './_components/leads-table'
import type { LeadStatus } from '@prisma/client'

const PAGE_SIZE = 20

const VALID_STATUSES: LeadStatus[] = [
  'NEW',
  'CONTACTED',
  'DEMO_SCHEDULED',
  'ENROLLED',
  'NURTURING',
  'LOST',
]

function maskPhone(phone: string): string {
  if (phone.length < 6) return phone
  const keep = 2
  const masked = phone.length - keep * 2
  return phone.slice(0, keep) + 'x'.repeat(masked) + phone.slice(-keep)
}

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; status?: string; q?: string }>
}) {
  const session = await auth()
  if (!session?.user) redirect('/login')
  if (!hasPermission(session.user, 'read', 'lead')) redirect('/admin/dashboard')

  const params = await searchParams
  const page = Math.max(1, Number(params.page ?? 1))
  const statusParam = params.status as LeadStatus | undefined
  const q = params.q?.trim()

  const statusFilter =
    statusParam && VALID_STATUSES.includes(statusParam) ? statusParam : undefined

  const where = {
    deletedAt: null as null,
    ...(statusFilter ? { status: statusFilter } : {}),
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

  const isMarketing = session.user.role === 'MARKETING'
  const canUpdate = hasPermission(session.user, 'update', 'lead')
  const canDelete = hasPermission(session.user, 'delete', 'lead')

  // Serialize dates + mask phone for MARKETING role
  const leads: LeadRow[] = rawLeads.map(lead => ({
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
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Danh sách Lead</h1>
        <p className="mt-1 text-sm text-gray-500">
          {total > 0 ? `Tổng ${total} lead` : 'Chưa có lead nào'}
        </p>
      </div>

      <LeadsTable
        leads={leads}
        total={total}
        page={page}
        pageSize={PAGE_SIZE}
        canUpdate={canUpdate}
        canDelete={canDelete}
        currentStatus={statusFilter}
        currentQ={q}
      />
    </div>
  )
}
