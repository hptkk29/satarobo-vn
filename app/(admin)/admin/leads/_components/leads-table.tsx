'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useTransition, useRef, useState, useEffect } from 'react'
import { Search, ChevronLeft, ChevronRight, Loader2, X, Download, Trash2, CheckCircle2 } from 'lucide-react'
import { updateLeadNote, updateLeadStatus, deleteLead } from '../actions'
import { CloseDealDialog } from './close-deal-dialog'
import {
  LEAD_STATUS_LABEL as STATUS_LABELS,
  LEAD_STATUS_BADGE as STATUS_COLORS,
  KANBAN_COLUMNS,
} from '@/lib/leads/status'

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
  assignedTo: { name: string | null } | null
}

function shortSource(source: string | null): string {
  if (!source) return '—'
  const parts = source.split(' - ')
  return parts.slice(0, 2).join(' · ')
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('vi-VN', {
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
        className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_COLORS[lead.status as keyof typeof STATUS_COLORS] ?? 'bg-gray-100 text-gray-500'}`}
      >
        {STATUS_LABELS[lead.status as keyof typeof STATUS_LABELS] ?? lead.status}
      </span>
    )
  }

  return (
    <div className="relative flex items-center gap-1.5">
      {pending && <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-400" />}
      <select
        defaultValue={lead.status}
        disabled={pending}
        onClick={e => e.stopPropagation()}
        onChange={e => {
          startTransition(async () => {
            await updateLeadStatus(lead.id, e.target.value)
          })
        }}
        className={`rounded-full border-0 py-0.5 pl-2.5 pr-6 text-xs font-semibold focus:ring-2 focus:ring-primary/20 ${STATUS_COLORS[lead.status as keyof typeof STATUS_COLORS] ?? 'bg-gray-100 text-gray-500'}`}
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
      className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors disabled:opacity-50 ${
        confirming
          ? 'bg-red-600 text-white hover:bg-red-700'
          : 'text-red-600 hover:bg-red-50'
      }`}
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
      <dt className="text-xs font-semibold uppercase tracking-wide text-gray-400">{label}</dt>
      <dd className="mt-1 break-words text-sm text-gray-800">{value || '—'}</dd>
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
      <aside className="absolute right-0 top-0 flex h-full w-full max-w-xl flex-col bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-gray-100 p-5">
          <div>
            <h2 className="text-lg font-bold text-gray-900">{lead.parentName}</h2>
            <p className="mt-1 text-sm text-gray-500">{lead.phone}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            aria-label="Đóng"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto p-5">
          <section>
            <h3 className="mb-3 text-sm font-bold text-gray-900">Thông tin lead</h3>
            <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <DetailItem label="Tên phụ huynh" value={lead.parentName} />
              <DetailItem label="Số điện thoại" value={lead.phone} />
              <DetailItem label="Email" value={lead.email} />
              <DetailItem label="Tên con" value={lead.childName} />
              <DetailItem label="Tuổi" value={lead.childAge} />
              <DetailItem label="Cơ sở" value={lead.center?.name} />
              <DetailItem label="Khóa quan tâm" value={shortSource(lead.source)} />
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-gray-400">Trạng thái</dt>
                <dd className="mt-1">
                  <select
                    value={status}
                    onChange={e => setStatus(e.target.value)}
                    disabled={!canUpdate || pending}
                    className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-primary-purple focus:outline-none focus:ring-2 focus:ring-primary-purple/20 disabled:bg-gray-50"
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
            <h3 className="mb-3 text-sm font-bold text-gray-900">Tracking</h3>
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
            <label htmlFor="lead-note" className="mb-2 block text-sm font-bold text-gray-900">
              Note
            </label>
            <textarea
              id="lead-note"
              value={note}
              onChange={e => setNote(e.target.value)}
              disabled={!canUpdate || pending}
              rows={5}
              className="w-full rounded-lg border border-gray-200 p-3 text-sm focus:border-primary-purple focus:outline-none focus:ring-2 focus:ring-primary-purple/20 disabled:bg-gray-50"
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
  canCloseDeal = false,
  currentStatus,
  currentQ,
}: {
  leads: LeadRow[]
  total: number
  page: number
  pageSize: number
  canUpdate: boolean
  canDelete: boolean
  canCloseDeal?: boolean
  currentStatus?: string
  currentQ?: string
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const searchRef = useRef<HTMLInputElement>(null)
  const [selectedLead, setSelectedLead] = useState<LeadRow | null>(null)
  const [closeLead, setCloseLead] = useState<{ id: string; name: string } | null>(null)
  const totalPages = Math.ceil(total / pageSize)
  const showActions = canDelete || canCloseDeal

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

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    navigate({ q: searchRef.current?.value.trim() ?? '' })
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <form onSubmit={handleSearch} className="relative flex-1 sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            ref={searchRef}
            type="search"
            defaultValue={currentQ ?? ''}
            placeholder="Tìm theo tên, số điện thoại..."
            className="w-full rounded-lg border border-gray-200 py-2 pl-9 pr-3 text-sm focus:border-primary-purple focus:outline-none focus:ring-2 focus:ring-primary-purple/20"
          />
        </form>

        <select
          value={currentStatus ?? ''}
          onChange={e => navigate({ status: e.target.value || undefined })}
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-primary-purple focus:outline-none focus:ring-2 focus:ring-primary-purple/20"
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
          className="ml-auto inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50 hover:text-gray-900"
          title="Xuất CSV"
        >
          <Download className="h-4 w-4" />
          <span className="hidden sm:inline">Xuất CSV</span>
        </a>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-100">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Phụ huynh / học sinh
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Số điện thoại
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Khóa quan tâm
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Trạng thái
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Cơ sở
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Sale phụ trách
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Ngày đăng ký
                </th>
                {showActions && (
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Hành động
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {leads.length === 0 ? (
                <tr>
                  <td
                    colSpan={showActions ? 8 : 7}
                    className="px-4 py-12 text-center text-sm text-gray-400"
                  >
                    Chưa có lead nào
                  </td>
                </tr>
              ) : (
                leads.map(lead => (
                  <tr
                    key={lead.id}
                    onClick={() => setSelectedLead(lead)}
                    className="cursor-pointer hover:bg-gray-50/60"
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{lead.parentName}</div>
                      {lead.childName && (
                        <div className="text-xs text-gray-400">
                          Con: {lead.childName}
                          {lead.childAge ? ` · ${lead.childAge} tuổi` : ''}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm tabular-nums text-gray-700">
                      {lead.phone}
                    </td>
                    <td className="px-4 py-3 max-w-[200px]">
                      <span className="block truncate text-sm text-gray-600" title={lead.source ?? ''}>
                        {shortSource(lead.source)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <StatusCell lead={lead} canUpdate={canUpdate} />
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {lead.center?.name ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {lead.assignedTo?.name ? (
                        <span className="text-gray-700">{lead.assignedTo.name}</span>
                      ) : (
                        <span className="font-medium text-amber-600">Chưa phân công</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500 tabular-nums">
                      {formatDate(lead.createdAt)}
                    </td>
                    {showActions && (
                      <td
                        className="px-4 py-3 text-right"
                        onClick={e => e.stopPropagation()}
                      >
                        <div className="flex items-center justify-end gap-2">
                          {canCloseDeal &&
                            lead.status !== 'ENROLLED' &&
                            lead.status !== 'LOST' &&
                            lead.status !== 'DUPLICATE' && (
                              <button
                                type="button"
                                onClick={() =>
                                  setCloseLead({ id: lead.id, name: lead.parentName })
                                }
                                className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2 py-1 text-xs font-semibold text-white hover:bg-emerald-700"
                              >
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                Chốt deal
                              </button>
                            )}
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
        <div className="flex items-center justify-between text-sm text-gray-500">
          <span>
            Trang {page}/{totalPages} · {total} lead
          </span>
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => goPage(page - 1)}
              disabled={page <= 1}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Trang trước"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => goPage(page + 1)}
              disabled={page >= totalPages}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
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

      <CloseDealDialog
        leadId={closeLead?.id ?? null}
        leadName={closeLead?.name ?? ''}
        onClose={() => setCloseLead(null)}
        onSuccess={() => router.refresh()}
      />
    </div>
  )
}
