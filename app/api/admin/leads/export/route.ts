import { requireLiveSession } from '@/lib/auth/live-session'
import { checkPermission, canViewLeadPii } from '@/lib/auth/check-permission'
import { resolveActor } from '@/lib/auth/actor'
import { scopedDb } from '@/lib/db-scope'
import { maskPhone, maskEmail, maskPersonName, maskFreeText } from '@/lib/lead/pii'
import { writeAudit } from '@/lib/audit/audit-log'
import { getAuditActor } from '@/lib/audit/log'
import { exportWatermark } from '@/lib/export/watermark'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import type { LeadStatus } from '@prisma/client'
import { ALL_LEAD_STATUSES } from '@/lib/leads/status'

const VALID_STATUSES: LeadStatus[] = ALL_LEAD_STATUSES

function escapeCsv(value: string | null | undefined): string {
  if (value == null) return ''
  const str = String(value)
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

export async function GET(req: NextRequest) {
  const session = await requireLiveSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await checkPermission('leads:view-all'))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = req.nextUrl
  const statusParam = searchParams.get('status') as LeadStatus | null
  const q = searchParams.get('q')?.trim()

  const statusFilter = statusParam && VALID_STATUSES.includes(statusParam) ? statusParam : undefined

  const where = {
    deletedAt: null as null,
    ...(statusFilter ? { status: statusFilter } : {}),
    ...(q ? {
      OR: [
        { parentName: { contains: q, mode: 'insensitive' as const } },
        { phone: { contains: q } },
        { childName: { contains: q, mode: 'insensitive' as const } },
      ],
    } : {}),
  }

  // #11 T2 — export CÁCH LY CƠ SỞ: Lead ∈ SCOPED_MODELS → sdb.lead tự inject
  // `centerId IN visible` (CM/Sale CS1 không export được lead CS2; SUPER_ADMIN/HO = ALL).
  const actor = await resolveActor(session.user.id)
  const leads = await scopedDb(actor).lead.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 5000,
    select: {
      id: true,
      parentName: true,
      phone: true,
      email: true,
      childName: true,
      childAge: true,
      status: true,
      source: true,
      utmSource: true,
      utmMedium: true,
      utmCampaign: true,
      note: true,
      consentMarketing: true,
      createdAt: true,
      center: { select: { name: true } },
      assignedTo: { select: { name: true } },
    },
  })

  // #11 T2 — mask PII lead (SĐT/email/tên PH-HS/note) NGAY TẠI SERVER trước khi
  // ghi CSV cho actor không có quyền leads:view-pii (vd MARKETING).
  const canViewPii = await canViewLeadPii()

  const headers = [
    'ID', 'Phụ huynh', 'SĐT', 'Email', 'Tên con', 'Tuổi',
    'Trạng thái', 'Nguồn', 'UTM Source', 'UTM Medium', 'UTM Campaign',
    'Cơ sở', 'Phụ trách', 'Ghi chú', 'Ngày đăng ký',
  ]

  const rows = leads.map((lead) => [
    lead.id,
    canViewPii ? lead.parentName : maskPersonName(lead.parentName),
    canViewPii ? lead.phone : maskPhone(lead.phone),
    canViewPii ? (lead.email ?? '') : lead.email ? maskEmail(lead.email) : '',
    canViewPii ? (lead.childName ?? '') : maskPersonName(lead.childName),
    lead.childAge != null ? String(lead.childAge) : '',
    lead.status,
    lead.source ?? '',
    lead.utmSource ?? '',
    lead.utmMedium ?? '',
    lead.utmCampaign ?? '',
    lead.center?.name ?? '',
    lead.assignedTo?.name ?? '',
    canViewPii ? (lead.note ?? '') : (maskFreeText(lead.note) ?? ''),
    lead.createdAt.toLocaleDateString('vi-VN'),
  ].map(escapeCsv).join(','))

  const now = new Date()
  const { actorId, actorName } = getAuditActor(session)
  // SEC-M05: watermark dòng cuối (truy vết) + audit EXPORT.
  const watermark = exportWatermark(actorName, actorId, leads.length, now)
  const csv = [headers.join(','), ...rows, '', escapeCsv(watermark)].join('\r\n')
  const bom = '﻿' // UTF-8 BOM for Excel

  const date = now.toISOString().slice(0, 10)

  await writeAudit({
    actor: { id: actorId, name: actorName },
    module: 'leads',
    entityType: 'Lead',
    entityId: 'export',
    action: 'EXPORT',
    newValues: {
      count: leads.length,
      status: statusFilter ?? 'ALL',
      q: q ?? null,
      piiMasked: !canViewPii,
    },
  })

  return new NextResponse(bom + csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="leads-${date}.csv"`,
    },
  })
}
