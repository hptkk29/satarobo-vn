'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useTransition, useState, useEffect } from 'react'
import { Loader2, X, Download, Trash2, CheckCircle2, ArrowDown, Columns3 } from 'lucide-react'
import {
  LEAD_COLUMNS,
  LEAD_COLUMNS_STORAGE_KEY,
  chuanHoaCot,
  cotMacDinh,
} from '@/lib/tables/lead-columns'
import { toast } from 'sonner'
import { updateLeadNote, updateLeadStatus, deleteLead } from '../actions'
import {
  LEAD_DROP_STATUSES,
  LEAD_STATUS_LABEL as STATUS_LABELS,
  LEAD_STATUS_BADGE as STATUS_COLORS,
  KANBAN_COLUMNS,
} from '@/lib/leads/status'
import type { LeadStatus } from '@prisma/client'
import { LyDoRotDialog } from './ly-do-rot-dialog'
import { Badge } from '@/components/ui/badge'
import { ChonSoDong } from '@/components/ui/chon-so-dong'
import { DieuHuongTrang } from '@/components/ui/dieu-huong-trang'

export type LeadRow = {
  id: string
  parentName: string
  phone: string
  email: string | null
  childName: string | null
  childAge: number | null
  status: string
  source: string | null
  note: string | null
  utmSource: string | null
  utmMedium: string | null
  utmCampaign: string | null
  eventId: string | null
  landingPage: string | null
  referrer: string | null
  ipAddress: string | null
  userAgent: string | null
  consentMarketing: boolean
  createdAt: string
  /** Lần nhập gần nhất; null với lead cũ chưa có mốc. */
  lastInboundAt: string | null
  center: { name: string } | null
  courseName: string | null
  assignedTo: { name: string | null } | null
  // SHARE T1 — lead bật "dùng chung" cho team (badge trên bảng).
  isSharedWithTeam: boolean
  assignedToId: string | null
}

/** SHARE T1 — chip "Dùng chung": outline = lead người khác chia sẻ cho mình;
 *  secondary = lead mình đang chia sẻ cho team. */
function SharedBadge({ lead, currentUserId }: { lead: LeadRow; currentUserId: string }) {
  if (!lead.isSharedWithTeam) return null
  if (lead.assignedToId === currentUserId) {
    return (
      <Badge variant="secondary" title="Bạn đang chia sẻ lead này">
        Dùng chung
      </Badge>
    )
  }
  return <Badge variant="outline">Dùng chung</Badge>
}

function shortSource(source: string | null): string {
  if (!source) return '—'
  const parts = source.split(' - ')
  return parts.slice(0, 2).join(' · ')
}

/**
 * Ngày KÈM GIỜ (30/08) — dùng cho cột "Ngày nhận lead".
 *
 * Ngày không thôi là chưa đủ: ngày cao điểm có hàng chục phiếu, mà thứ Sale cần biết
 * là ai vào TRƯỚC — gọi theo thứ tự đó mới đúng cam kết phản hồi.
 */
function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function StatusCell({
  lead,
  canChangeStatus,
}: {
  lead: LeadRow
  /** 27/08 — `leads:change-status`, KHÔNG phải `leads:edit`: chỉ Sale đẩy được lead
   *  trên phễu. Không có quyền thì ô này chỉ là NHÃN, không phải nút. */
  canChangeStatus: boolean
}) {
  const [pending, startTransition] = useTransition()
  /** Bậc rơi đang chờ lý do. `null` = không có gì đang chờ. */
  const [choLyDo, setChoLyDo] = useState<LeadStatus | null>(null)

  function doiTrangThai(next: LeadStatus, lyDo?: string) {
    startTransition(async () => {
      const res = await updateLeadStatus(lead.id, next, lyDo)
      if (!res.ok) {
        // Guard pipeline (R7-01) chặn có lý do — nói rõ lý do cho sale.
        toast.error(res.error ?? 'Không đổi được trạng thái')
      } else {
        setChoLyDo(null)
      }
    })
  }

  if (!canChangeStatus) {
    return (
      <span
        className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_COLORS[lead.status as keyof typeof STATUS_COLORS] ?? 'bg-muted text-muted-foreground'}`}
      >
        {STATUS_LABELS[lead.status as keyof typeof STATUS_LABELS] ?? lead.status}
      </span>
    )
  }

  return (
    <div className="relative flex items-center gap-1.5">
      <LyDoRotDialog
        status={choLyDo}
        tenLead={lead.parentName}
        dangGui={pending}
        onHuy={() => setChoLyDo(null)}
        onXacNhan={(lyDo) => choLyDo && doiTrangThai(choLyDo, lyDo)}
      />
      {pending && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
      <select
        // `value` chứ không phải `defaultValue`: khi server TỪ CHỐI chuyển trạng thái,
        // ô select phải quay về trạng thái thật. Trước 03/08 dùng defaultValue + bỏ
        // qua kết quả action ⇒ chọn "Đã đăng ký" trên lead chưa đủ điều kiện thì ô
        // vẫn hiện "Đã đăng ký" trong khi DB không đổi gì, không báo một chữ nào.
        value={lead.status}
        disabled={pending}
        onClick={e => e.stopPropagation()}
        onChange={e => {
          const next = e.target.value as LeadStatus
          // Bậc rơi phải kèm lý do — hỏi trước, ghi sau (server cũng kiểm lại).
          if (LEAD_DROP_STATUSES.includes(next)) {
            setChoLyDo(next)
            return
          }
          doiTrangThai(next)
        }}
        className={`rounded-full border-0 py-0.5 pl-2.5 pr-6 text-xs font-semibold focus:ring-2 focus:ring-primary/20 ${STATUS_COLORS[lead.status as keyof typeof STATUS_COLORS] ?? 'bg-muted text-muted-foreground'}`}
      >
        {KANBAN_COLUMNS.map((value) => (
                      <option key={value} value={value}>
                        {STATUS_LABELS[value]}
                      </option>
                    ))}
      </select>
    </div>
  )
}

function DeleteCell({ lead, onDeleted }: { lead: LeadRow; onDeleted: () => void }) {
  const [confirming, setConfirming] = useState(false)
  const [pending, startTransition] = useTransition()

  // Reset confirm state sau 4 giây nếu user không click tiếp
  useEffect(() => {
    if (!confirming) return
    const t = setTimeout(() => setConfirming(false), 4000)
    return () => clearTimeout(t)
  }, [confirming])

  function handleClick() {
    if (!confirming) {
      setConfirming(true)
      return
    }
    startTransition(async () => {
      const res = await deleteLead(lead.id)
      if (res.ok) {
        onDeleted()
      } else {
        alert(res.error ?? 'Lỗi xoá lead')
        setConfirming(false)
      }
    })
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors disabled:opacity-50 ${ confirming ? 'bg-state-danger-ink text-white hover:bg-state-danger-ink' : 'text-state-danger-ink hover:bg-state-danger-soft' }`}
      aria-label={confirming ? `Xác nhận xoá ${lead.parentName}` : `Xoá ${lead.parentName}`}
    >
      {pending ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <Trash2 className="h-3.5 w-3.5" />
      )}
      {confirming ? 'Xác nhận?' : 'Xoá'}
    </button>
  )
}

function DetailItem({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-words text-sm text-foreground">{value || '—'}</dd>
    </div>
  )
}

function LeadDrawer({
  lead,
  canUpdate,
  canChangeStatus,
  onClose,
}: {
  lead: LeadRow | null
  canUpdate: boolean
  canChangeStatus: boolean
  onClose: () => void
}) {
  const [note, setNote] = useState(lead?.note ?? '')
  // 'MOI' chứ không phải 'NEW': GĐ5 rút enum còn 10 giá trị tiếng Việt. Ô này khai
  // kiểu `string` nên tsc không đỏ — giá trị chết nằm im ở đây từ đợt gộp enum.
  const [status, setStatus] = useState<LeadStatus>((lead?.status as LeadStatus) ?? 'MOI')
  const [pending, startTransition] = useTransition()
  /** Bậc rơi đang chờ lý do trước khi Lưu. `null` = không có gì đang chờ. */
  const [choLyDo, setChoLyDo] = useState<LeadStatus | null>(null)

  function luu(lyDo?: string) {
    if (!lead) return
    startTransition(async () => {
      if (status !== lead.status) {
        const res = await updateLeadStatus(lead.id, status, lyDo)
        if (!res.ok) {
          // Trước đây kết quả bị NUỐT: server từ chối thì ngăn vẫn đóng như thành
          // công, ô trạng thái vẫn hiện giá trị mới, DB không đổi gì.
          toast.error(res.error ?? 'Không đổi được trạng thái')
          return
        }
      }
      await updateLeadNote(lead.id, note)
      setChoLyDo(null)
      toast.success('Đã lưu')
    })
  }

  if (!lead) return null

  return (
    <div className="fixed inset-0 z-50">
      <LyDoRotDialog
        status={choLyDo}
        tenLead={lead.parentName}
        dangGui={pending}
        onHuy={() => setChoLyDo(null)}
        onXacNhan={(lyDo) => luu(lyDo)}
      />
      <button
        type="button"
        aria-label="Đóng chi tiết lead"
        className="absolute inset-0 bg-black/30"
        onClick={onClose}
      />
      <aside className="absolute right-0 top-0 flex h-full w-full max-w-xl flex-col bg-card shadow-2xl">
        <div className="flex items-start justify-between border-b border-border p-5">
          <div>
            <h2 className="text-lg font-bold text-foreground">{lead.parentName}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{lead.phone}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-muted-foreground"
            aria-label="Đóng"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto p-5">
          <section>
            <h3 className="mb-3 text-sm font-bold text-foreground">Thông tin lead</h3>
            <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <DetailItem label="Tên phụ huynh" value={lead.parentName} />
              <DetailItem label="Số điện thoại" value={lead.phone} />
              <DetailItem label="Email" value={lead.email} />
              <DetailItem label="Tên con" value={lead.childName} />
              <DetailItem label="Tuổi" value={lead.childAge} />
              <DetailItem label="Cơ sở" value={lead.center?.name} />
              <DetailItem label="Khóa quan tâm" value={lead.courseName ?? '—'} />
              <DetailItem label="Nguồn" value={shortSource(lead.source)} />
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Trạng thái</dt>
                <dd className="mt-1">
                  <select
                    value={status}
                    onChange={e => setStatus(e.target.value as LeadStatus)}
                    disabled={!canChangeStatus || pending}
                    className="rounded-lg border border-border px-3 py-2 text-sm focus:border-primary-purple focus:outline-none focus:ring-2 focus:ring-primary-purple/20 disabled:bg-muted"
                  >
                    {KANBAN_COLUMNS.map((value) => (
                      <option key={value} value={value}>
                        {STATUS_LABELS[value]}
                      </option>
                    ))}
                  </select>
                </dd>
              </div>
            </dl>
          </section>

          <section>
            <h3 className="mb-3 text-sm font-bold text-foreground">Tracking</h3>
            <dl className="grid grid-cols-1 gap-4">
              <DetailItem label="UTM" value={[lead.utmSource, lead.utmMedium, lead.utmCampaign].filter(Boolean).join(' / ')} />
              <DetailItem label="Event ID" value={lead.eventId} />
              <DetailItem label="Landing page" value={lead.landingPage} />
              <DetailItem label="Referrer" value={lead.referrer} />
              <DetailItem label="IP address" value={lead.ipAddress} />
              <DetailItem label="User agent" value={lead.userAgent} />
              <DetailItem label="Consent marketing" value={lead.consentMarketing ? 'Có' : 'Không'} />
            </dl>
          </section>

          <section>
            <label htmlFor="lead-note" className="mb-2 block text-sm font-bold text-foreground">
              Note
            </label>
            <textarea
              id="lead-note"
              value={note}
              onChange={e => setNote(e.target.value)}
              disabled={!canUpdate || pending}
              rows={5}
              className="w-full rounded-lg border border-border p-3 text-sm focus:border-primary-purple focus:outline-none focus:ring-2 focus:ring-primary-purple/20 disabled:bg-muted"
              placeholder="Thêm ghi chú chăm sóc lead..."
            />
            {canUpdate && (
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  // Bậc rơi phải kèm lý do — hỏi trước khi ghi (server kiểm lại).
                  if (status !== lead.status && LEAD_DROP_STATUSES.includes(status)) {
                    setChoLyDo(status)
                    return
                  }
                  luu()
                }}
                className="mt-3 rounded-lg bg-primary-purple px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
              >
                {pending ? 'Đang lưu...' : 'Save'}
              </button>
            )}
            {canUpdate && (
              // P1-d — sửa đầy đủ hồ sơ lead.
              <Link
                href={`/leads/${lead.id}/edit`}
                className="ml-2 mt-3 inline-block text-sm font-semibold text-primary-purple hover:underline"
              >
                Sửa đầy đủ →
              </Link>
            )}
          </section>
        </div>
      </aside>
    </div>
  )
}

/**
 * Đầu cột BẤM ĐƯỢC để đổi thứ tự.
 *
 * Giữ nguyên mọi tham số đang có trên URL (bộ lọc, từ khoá, cỡ trang) và CHỈ đặt lại
 * `sort` + `page=1`: đổi cách sắp mà vẫn ở trang 5 là nhìn vào giữa bảng, tưởng dữ
 * liệu nhảy lung tung.
 */
function ThSap({
  nhan,
  khoa,
  dangSap,
}: {
  nhan: string
  khoa: 'moi_nhat' | 'nhap_lai'
  dangSap: 'moi_nhat' | 'nhap_lai'
}) {
  const searchParams = useSearchParams()
  const u = new URLSearchParams(searchParams.toString())
  u.set('sort', khoa)
  u.set('page', '1')
  const dang = dangSap === khoa
  return (
    <Link
      href={`/leads?${u.toString()}`}
      className={`inline-flex items-center gap-1 hover:text-foreground ${dang ? 'text-foreground' : ''}`}
      title={dang ? 'Đang sắp theo cột này' : `Sắp theo ${nhan.toLowerCase()}`}
    >
      {nhan}
      {dang && <ArrowDown className="h-3 w-3" aria-hidden />}
    </Link>
  )
}

/**
 * Một Ô của bảng, chọn theo KHOÁ CỘT trong danh mục (`lib/tables/lead-columns.ts`).
 *
 * ⚠️ Mọi giá trị ở đây đã đi qua che PII Ở SERVER (`maskLeadPiiFields` trong page.tsx)
 * TRƯỚC khi xuống client. Đừng thêm ô nào đọc dữ liệu từ nguồn khác.
 */
function LeadCell({
  col,
  lead,
  canChangeStatus,
  currentUserId,
}: {
  col: string
  lead: LeadRow
  canChangeStatus: boolean
  currentUserId: string
}) {
  switch (col) {
    case 'parentName':
      return (
        <td className="px-4 py-3">
          <div className="flex items-center gap-1.5">
            <span className="font-medium text-foreground">{lead.parentName}</span>
            <SharedBadge lead={lead} currentUserId={currentUserId} />
          </div>
          {lead.childName && (
            <div className="text-xs text-muted-foreground">
              Con: {lead.childName}
              {lead.childAge ? ` · ${lead.childAge} tuổi` : ''}
            </div>
          )}
        </td>
      )
    case 'phone':
      return <td className="px-4 py-3 text-sm tabular-nums text-foreground">{lead.phone}</td>
    case 'course':
      return (
        <td className="px-4 py-3 max-w-[200px]">
          <span className="block truncate text-sm text-muted-foreground" title={lead.courseName ?? ''}>
            {lead.courseName ?? '—'}
          </span>
          {lead.source && (
            <span className="block truncate text-xs text-muted-foreground" title={lead.source}>
              {shortSource(lead.source)}
            </span>
          )}
        </td>
      )
    case 'status':
      return (
        <td className="px-4 py-3">
          <StatusCell lead={lead} canChangeStatus={canChangeStatus} />
        </td>
      )
    case 'center':
      return <td className="px-4 py-3 text-sm text-muted-foreground">{lead.center?.name ?? '—'}</td>
    case 'assignedTo':
      return (
        <td className="px-4 py-3 text-sm">
          {lead.assignedTo?.name ? (
            <span className="text-foreground">{lead.assignedTo.name}</span>
          ) : (
            <span className="font-medium text-state-warning-ink">Chưa phân công</span>
          )}
        </td>
      )
    case 'createdAt':
      return (
        <td className="px-4 py-3 whitespace-nowrap text-sm text-muted-foreground tabular-nums">
          {formatDateTime(lead.createdAt)}
        </td>
      )
    case 'lastInboundAt':
      return (
        <td className="px-4 py-3 whitespace-nowrap text-sm tabular-nums">
          {lead.lastInboundAt ? (
            <span
              className={
                // Nhập lại SAU ngày tạo = khách chủ động quay lại. Tín hiệu nóng nhất
                // trên bảng này, đừng để nó chìm.
                lead.lastInboundAt > lead.createdAt
                  ? 'font-semibold text-state-success-ink'
                  : 'text-muted-foreground'
              }
            >
              {formatDateTime(lead.lastInboundAt)}
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </td>
      )
    case 'childName':
      return <td className="px-4 py-3 text-sm text-foreground">{lead.childName ?? '—'}</td>
    case 'childAge':
      return (
        <td className="px-4 py-3 text-sm tabular-nums text-muted-foreground">
          {lead.childAge ?? '—'}
        </td>
      )
    case 'email':
      return (
        <td className="px-4 py-3 max-w-[200px]">
          <span className="block truncate text-sm text-muted-foreground" title={lead.email ?? ''}>
            {lead.email ?? '—'}
          </span>
        </td>
      )
    case 'source':
      return (
        <td className="px-4 py-3 max-w-[180px]">
          <span className="block truncate text-sm text-muted-foreground" title={lead.source ?? ''}>
            {lead.source ? shortSource(lead.source) : '—'}
          </span>
        </td>
      )
    case 'note':
      return (
        <td className="px-4 py-3 max-w-[240px]">
          <span className="block truncate text-sm text-muted-foreground" title={lead.note ?? ''}>
            {lead.note ?? '—'}
          </span>
        </td>
      )
    case 'utmCampaign':
      return (
        <td className="px-4 py-3 max-w-[180px]">
          <span className="block truncate text-sm text-muted-foreground" title={lead.utmCampaign ?? ''}>
            {lead.utmCampaign ?? '—'}
          </span>
        </td>
      )
    default:
      // Khoá lạ không bao giờ tới được đây (`chuanHoaCot` đã lọc), nhưng trả ô rỗng
      // vẫn tốt hơn làm lệch số ô so với số <th>.
      return <td className="px-4 py-3" />
  }
}

export function LeadsTable({
  leads,
  total,
  page,
  pageSize,
  canUpdate,
  canChangeStatus,
  sapXep,
  canDelete,
  currentStatus,
  currentQ,
  currentUserId,
}: {
  leads: LeadRow[]
  total: number
  page: number
  pageSize: number
  canUpdate: boolean
  /** 27/08 — quyền RIÊNG `leads:change-status` (chỉ Sale). Tách khỏi canUpdate
   *  vì Quản lý cơ sở/Marketing vẫn sửa hồ sơ lead, chỉ không đẩy bậc phễu. */
  canChangeStatus: boolean
  /** Cột đang được sắp xếp — để tô đậm đầu cột tương ứng. */
  sapXep: 'moi_nhat' | 'nhap_lai'
  canDelete: boolean
  currentStatus?: string
  currentQ?: string
  currentUserId: string
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [selectedLead, setSelectedLead] = useState<LeadRow | null>(null)
  // CỘT HIỂN THỊ — mỗi người một bộ, lưu trong trình duyệt của chính họ.
  //
  // KHÔNG lưu ở DB/URL có chủ đích: đây là tiện nghi cá nhân, không phải dữ liệu cần
  // chia sẻ hay khôi phục. Khởi tạo bằng bộ MẶC ĐỊNH rồi mới đọc localStorage trong
  // `useEffect` — đọc thẳng lúc render là hydrate lệch (server không có localStorage).
  const [cot, setCot] = useState<string[]>(() => cotMacDinh())
  const [moChonCot, setMoChonCot] = useState(false)

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(LEAD_COLUMNS_STORAGE_KEY)
      if (raw) setCot(chuanHoaCot(JSON.parse(raw)))
    } catch {
      // Trình duyệt chặn site data / JSON hỏng → giữ bộ mặc định. Bảng phải chạy được
      // kể cả khi không đọc được gì.
    }
  }, [])

  function doiCot(key: string, hien: boolean) {
    setCot(prev => {
      const moi = chuanHoaCot(hien ? [...prev, key] : prev.filter(k => k !== key))
      try {
        window.localStorage.setItem(LEAD_COLUMNS_STORAGE_KEY, JSON.stringify(moi))
      } catch {
        // Không lưu được thì vẫn đổi trong phiên này — mất khi tải lại, không sao.
      }
      return moi
    })
  }

  const cotHien = LEAD_COLUMNS.filter(c => cot.includes(c.key))
  const totalPages = Math.ceil(total / pageSize)
  // Nút "Xem chi tiết lead" hiện cho mọi role xem được lead → luôn render cột thao tác.
  const showActions = true

  const navigate = (updates: Record<string, string | undefined>) => {
    const params = new URLSearchParams(searchParams.toString())
    Object.entries(updates).forEach(([k, v]) => {
      if (v === undefined || v === '') {
        params.delete(k)
      } else {
        params.set(k, v)
      }
    })
    params.delete('page')
    router.push(`/leads?${params.toString()}`)
  }

  const goPage = (p: number) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('page', String(p))
    router.push(`/leads?${params.toString()}`)
  }

  return (
    <div className="space-y-4">
      {/* Filters — tìm kiếm dùng chung ô "Tìm" ở thanh lọc phía trên (tránh 2 ô trùng nhau). */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <select
          value={currentStatus ?? ''}
          onChange={e => navigate({ status: e.target.value || undefined })}
          className="rounded-lg border border-border px-3 py-2 text-sm focus:border-primary-purple focus:outline-none focus:ring-2 focus:ring-primary-purple/20"
        >
          <option value="">Tất cả trạng thái</option>
          {KANBAN_COLUMNS.map((value) => (
                      <option key={value} value={value}>
                        {STATUS_LABELS[value]}
                      </option>
                    ))}
        </select>

        {/* Export CSV */}
        <a
          href={`/api/admin/leads/export${currentStatus ? `?status=${currentStatus}` : ''}${currentQ ? `${currentStatus ? '&' : '?'}q=${encodeURIComponent(currentQ)}` : ''}`}
          download
          className="ml-auto inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-semibold text-muted-foreground hover:bg-muted hover:text-foreground"
          title="Xuất CSV"
        >
          <Download className="h-4 w-4" />
          <span className="hidden sm:inline">Xuất CSV</span>
        </a>
        {/* CHỌN CỘT — 30/08. Đặt cạnh nút xuất vì cùng nhóm "điều khiển bảng". */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setMoChonCot(v => !v)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-muted"
          >
            <Columns3 className="h-4 w-4" /> Cột hiển thị
          </button>
          {moChonCot && (
            <>
              {/* Nền bắt click-ra-ngoài. Không dùng thư viện popover cho một hộp
                  chọn ở màn quản trị. */}
              <button
                type="button"
                aria-label="Đóng"
                onClick={() => setMoChonCot(false)}
                className="fixed inset-0 z-40 cursor-default"
              />
              <div className="absolute right-0 z-50 mt-1 w-64 rounded-xl border border-border bg-card p-2 shadow-lg">
                {LEAD_COLUMNS.map(c => (
                  <label
                    key={c.key}
                    className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm ${
                      c.batBuoc ? 'opacity-50' : 'cursor-pointer hover:bg-muted'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={cot.includes(c.key)}
                      disabled={c.batBuoc}
                      onChange={e => doiCot(c.key, e.target.checked)}
                    />
                    <span className="text-foreground">{c.label}</span>
                  </label>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    const md = cotMacDinh()
                    setCot(md)
                    try {
                      window.localStorage.setItem(LEAD_COLUMNS_STORAGE_KEY, JSON.stringify(md))
                    } catch {
                      /* không lưu được thì thôi */
                    }
                  }}
                  className="mt-1 w-full rounded-lg border border-border px-2 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted"
                >
                  Về mặc định
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-border">
            <thead className="bg-muted">
              <tr>
                {cotHien.map(c => (
                  <th
                    key={c.key}
                    className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                  >
                    {/* Hai cột mốc thời gian bấm được để đổi thứ tự; còn lại là nhãn thường. */}
                    {c.key === 'createdAt' ? (
                      <ThSap nhan={c.label} khoa="moi_nhat" dangSap={sapXep} />
                    ) : c.key === 'lastInboundAt' ? (
                      <ThSap nhan={c.label} khoa="nhap_lai" dangSap={sapXep} />
                    ) : (
                      c.label
                    )}
                  </th>
                ))}
                {showActions && (
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Hành động
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {leads.length === 0 ? (
                <tr>
                  <td
                    colSpan={cotHien.length + (showActions ? 1 : 0)}
                    className="px-4 py-12 text-center text-sm text-muted-foreground"
                  >
                    Chưa có lead nào
                  </td>
                </tr>
              ) : (
                leads.map(lead => (
                  <tr
                    key={lead.id}
                    onClick={() => setSelectedLead(lead)}
                    className="cursor-pointer hover:bg-muted/60"
                  >
                    {cotHien.map(c => (
                      <LeadCell
                        key={c.key}
                        col={c.key}
                        lead={lead}
                        canChangeStatus={canChangeStatus}
                        currentUserId={currentUserId}
                      />
                    ))}
                    {showActions && (
                      <td
                        className="px-4 py-3 text-right"
                        onClick={e => e.stopPropagation()}
                      >
                        <div className="flex items-center justify-end gap-2">
                          {/* FL2-01 — điều hướng vào trang chi tiết lead; hiện cho MỌI
                              trạng thái (kể cả đã ghi danh) và mọi role xem được lead. */}
                          <Link
                            href={`/leads/${lead.id}`}
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-1 rounded-md bg-primary-soft px-2 py-1 text-xs font-semibold text-primary hover:bg-primary-soft-hover"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Xem chi tiết lead
                          </Link>
                          {canDelete && (
                            <DeleteCell
                              lead={lead}
                              onDeleted={() => router.refresh()}
                            />
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {total > 0 && (
        <div className="flex flex-col gap-2 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <ChonSoDong soDong={pageSize} tong={total} tenDonVi="lead" />
            <span>
              Trang {page}/{totalPages}
            </span>
          </div>
          <DieuHuongTrang trang={page} soTrang={totalPages} onDoi={goPage} />
        </div>
      )}

      <LeadDrawer
        key={selectedLead?.id ?? 'empty'}
        lead={selectedLead}
        canUpdate={canUpdate}
        canChangeStatus={canChangeStatus}
        onClose={() => setSelectedLead(null)}
      />
    </div>
  )
}
