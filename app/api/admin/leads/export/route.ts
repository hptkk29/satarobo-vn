import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { hasPermission } from '@/lib/permissions'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import type { LeadStatus } from '@prisma/client'

const VALID_STATUSES: LeadStatus[] = ['NEW', 'CONTACTED', 'DEMO_SCHEDULED', 'ENROLLED', 'NURTURING', 'LOST']

function escapeCsv(value: string | null | undefined): string {
  if (value == null) return ''
  const str = String(value)
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

function maskPhone(phone: string): string {
  if (phone.length < 6) return phone
  const keep = 2
  return phone.slice(0, keep) + 'x'.repeat(phone.length - keep * 2) + phone.slice(-keep)
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasPermission(session.user, 'read', 'lead')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

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

  const leads = await db.lead.findMany({
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

  const isMarketing = session.user.role === 'MARKETING'

  const headers = [
    'ID', 'Phụ huynh', 'SĐT', 'Email', 'Tên con', 'Tuổi',
    'Trạng thái', 'Nguồn', 'UTM Source', 'UTM Medium', 'UTM Campaign',
    'Cơ sở', 'Phụ trách', 'Ghi chú', 'Ngày đăng ký',
  ]

  const rows = leads.map((lead) => [
    lead.id,
    lead.parentName,
    isMarketing ? maskPhone(lead.phone) : lead.phone,
    lead.email ?? '',
    lead.childName ?? '',
    lead.childAge != null ? String(lead.childAge) : '',
    lead.status,
    lead.source ?? '',
    lead.utmSource ?? '',
    lead.utmMedium ?? '',
    lead.utmCampaign ?? '',
    lead.center?.name ?? '',
    lead.assignedTo?.name ?? '',
    lead.note ?? '',
    lead.createdAt.toLocaleDateString('vi-VN'),
  ].map(escapeCsv).join(','))

  const csv = [headers.join(','), ...rows].join('\r\n')
  const bom = '﻿' // UTF-8 BOM for Excel

  const date = new Date().toISOString().slice(0, 10)

  return new NextResponse(bom + csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="leads-${date}.csv"`,
    },
  })
}
