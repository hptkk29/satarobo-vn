'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useTransition, useState, useEffect } from 'react'
import { ChevronLeft, ChevronRight, Loader2, X, Download, Trash2, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'
import { updateLeadNote, updateLeadStatus, deleteLead } from '../actions'
import {
  LEAD_STATUS_LABEL as STATUS_LABELS,
  LEAD_STATUS_BADGE as STATUS_COLORS,
  KANBAN_COLUMNS,
} from '@/lib/leads/status'
import { Badge } from '@/components/ui/badge'

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

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

function StatusCell({
  lead,
  canUpdate,
}: {
  lead: LeadRow
  canUpdate: boolean
}) {
  const [pending, startTransition] = useTransition()

  if (!canUpdate) {
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
          const next = e.target.value
          startTransition(async () => {
            const res = await updateLeadStatus(lead.id, next)
            if (!res.ok) {
              // Guard pipeline (R7-01) chặn có lý do — nói rõ lý do cho sale.
              toast.error(res.error ?? 'Không đổi được trạng thái')
            }
          })
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
  onClose,
}: {
  lead: LeadRow | null
  canUpdate: boolean
  onClose: () => void
}) {
  const [note, setNote] = useState(lead?.note ?? '')
  const [status, setStatus] = useState(lead?.status ?? 'NEW')
  const [pending, startTransition] = useTransition()

  if (!lead) return null

  return (
    <div className="fixed inset-0 z-50">
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
                    onChange={e => setStatus(e.target.value)}
                    disabled={!canUpdate || pending}
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
                  startTransition(async () => {
                    if (status !== lead.status) await updateLeadStatus(lead.id, status)
                    await updateLeadNote(lead.id, note)
                  })
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

export function LeadsTable({
  leads,
  total,
  page,
  pageSize,
  canUpdate,
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
  canDelete: boolean
  currentStatus?: string
  currentQ?: string
  currentUserId: string
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [selectedLead, setSelectedLead] = useState<LeadRow | null>(null)
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
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-border">
            <thead className="bg-muted">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Phụ huynh / học sinh
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Số điện thoại
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Khóa quan tâm
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Trạng thái
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Cơ sở
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Sale phụ trách
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Ngày đăng ký
                </th>
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
                    colSpan={showActions ? 8 : 7}
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
                    <td className="px-4 py-3 text-sm tabular-nums text-foreground">
                      {lead.phone}
                    </td>
                    <td className="px-4 py-3 max-w-[200px]">
                      <span className="block truncate text-sm text-muted-foreground" title={lead.courseName ?? lead.source ?? ''}>
                        {lead.courseName ?? '—'}
                      </span>
                      {lead.source && (
                        <span className="block truncate text-xs text-muted-foreground" title={lead.source}>
                          {shortSource(lead.source)}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <StatusCell lead={lead} canUpdate={canUpdate} />
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">
                      {lead.center?.name ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {lead.assignedTo?.name ? (
                        <span className="text-foreground">{lead.assignedTo.name}</span>
                      ) : (
                        <span className="font-medium text-state-warning-ink">Chưa phân công</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground tabular-nums">
                      {formatDate(lead.createdAt)}
                    </td>
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
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Trang {page}/{totalPages} · {total} lead
          </span>
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => goPage(page - 1)}
              disabled={page <= 1}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-border hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Trang trước"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => goPage(page + 1)}
              disabled={page >= totalPages}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-border hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Trang sau"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      <LeadDrawer
        key={selectedLead?.id ?? 'empty'}
        lead={selectedLead}
        canUpdate={canUpdate}
        onClose={() => setSelectedLead(null)}
      />
    </div>
  )
}
