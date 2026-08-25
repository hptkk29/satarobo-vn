import * as XLSX from 'xlsx'
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
import { phoneSearchTerm } from '@/lib/phone'

// A-03 (24/08/2026) — file xuất là .xlsx (SheetJS). `XLSX.write({ type: 'buffer' })` cần
// Node runtime; thiếu 2 dòng này là vỡ nếu route rơi xuống Edge. Cùng khuôn với
// `app/api/admin/crm/commission-export/route.ts:12-13`.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const VALID_STATUSES: LeadStatus[] = ALL_LEAD_STATUSES

/** A-03-6 — trần cứng số dòng mỗi lần xuất. Chạm trần thì PHẢI nói ra (sheet `_watermark`
 *  + `truncated` trong audit), không được cắt im lặng. */
const TRAN_DONG = 5000

export async function GET(req: NextRequest) {
  const session = await requireLiveSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // A-03-2 / [L-A3] — CỔNG LÀ **AND**, tuyệt đối không THAY THẾ `leads:view-all`.
  // Thay thế mở đúng một đường: người neo vai tại HO mà KHÔNG có `leads:*` nào rơi vào
  // nhánh `lib/db-scope.ts:236` (`!hasAnyPermissionForModel` → `isHoLevel` → `"ALL"`)
  // ⇒ xuất được lead TOÀN HỆ THỐNG. `leads:view-all` giữ vai trò "được đọc danh sách",
  // `leads:export` là "được cầm file mang đi" — hai việc khác nhau, cấp riêng nhau.
  // `leads:export` không đến từ vai nào (lib/auth/permissions.ts) mà từ NHÓM quyền.
  const [canViewAll, canExport] = await Promise.all([
    checkPermission('leads:view-all'),
    checkPermission('leads:export'),
  ])
  if (!canViewAll || !canExport) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = req.nextUrl
  const statusParam = searchParams.get('status') as LeadStatus | null
  const q = searchParams.get('q')?.trim()
  // SĐT lưu 2 dạng (0… cũ / 84… mới) — tìm theo phần lõi để không sót.
  const qPhone = q ? (phoneSearchTerm(q) ?? q) : q

  const statusFilter = statusParam && VALID_STATUSES.includes(statusParam) ? statusParam : undefined

  const where = {
    deletedAt: null as null,
    ...(statusFilter ? { status: statusFilter } : {}),
    ...(q ? {
      OR: [
        { parentName: { contains: q, mode: 'insensitive' as const } },
        { phone: { contains: qPhone } },
        { childName: { contains: q, mode: 'insensitive' as const } },
      ],
    } : {}),
  }

  // #11 T2 — export CÁCH LY CƠ SỞ: Lead ∈ SCOPED_MODELS → sdb.lead tự inject
  // `centerId IN visible` (CM/Sale CS1 không export được lead CS2; SUPER_ADMIN/HO = ALL).
  const actor = await resolveActor(session.user.id)
  // Lấy dư 1 dòng để BIẾT có bị cắt hay không (A-03-6) — `take: TRAN_DONG` trần trụi thì
  // "đúng 5000 dòng" và "hơn 5000 dòng" nhìn giống hệt nhau, và người xuất tưởng đủ.
  const found = await scopedDb(actor).lead.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: TRAN_DONG + 1,
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

  const truncated = found.length > TRAN_DONG
  const leads = truncated ? found.slice(0, TRAN_DONG) : found

  // #11 T2 — mask PII lead (SĐT/email/tên PH-HS/note) NGAY TẠI SERVER trước khi
  // ghi file cho actor không có quyền leads:view-pii (vd MARKETING).
  const canViewPii = await canViewLeadPii()

  // A-03 / G-03 — BỘ CỘT CỐ ĐỊNH. Không nhận tuỳ chọn cột từ query string: bộ cột thay
  // đổi theo người xuất thì audit "đã xuất gì" mất nghĩa, và mask PII khó rà.
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
  ])

  const now = new Date()
  const { actorId, actorName } = getAuditActor(session)

  // Giá trị THÔ vào ô Excel — không escape kiểu CSV (nhét chuỗi đã escape vào ô sẽ ra ô
  // có dấu nháy kép thừa ở tay người dùng).
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Leads')

  // SEC-M05 — watermark ở SHEET RIÊNG (khuôn commission-export/route.ts:62-66), không
  // chen vào sheet dữ liệu để người dùng còn lọc/sắp xếp được.
  const wmRows: string[][] = [['Watermark'], [exportWatermark(actorName, actorId, leads.length, now)]]
  if (truncated) {
    // A-03-6 — chạm trần thì NÓI RA. Cắt im lặng nguy hiểm hơn cắt: người xuất tưởng
    // mình đang cầm danh sách đủ.
    wmRows.push([
      `⚠️ ĐÃ CẮT BỚT: kết quả vượt trần ${TRAN_DONG} dòng, file này CHƯA đủ. ` +
        `Hãy lọc hẹp lại (trạng thái / từ khoá / khoảng thời gian) rồi xuất lại.`,
    ])
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(wmRows), '_watermark')

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
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
      // A-03-6 — người rà soát về sau phải phân biệt được "5000 lead" với "5000 dòng
      // đầu của một tập lớn hơn".
      truncated,
    },
  })

  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="leads-${date}.xlsx"`,
    },
  })
}
