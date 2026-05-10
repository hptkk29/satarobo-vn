'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useTransition, useRef, useState } from 'react'
import { Search, ChevronLeft, ChevronRight, Loader2, X } from 'lucide-react'
import { updateLeadNote, updateLeadStatus } from '../actions'

const STATUS_LABELS: Record<string, string> = {
  NEW: 'Lead mới',
  CONTACTED: 'Đã liên hệ',
  DEMO_SCHEDULED: 'Đã hẹn demo',
  ENROLLED: 'Đã đăng ký',
  NURTURING: 'Đang nuôi',
  LOST: 'Đã mất',
}

const STATUS_COLORS: Record<string, string> = {
  NEW: 'bg-blue-100 text-blue-700',
  CONTACTED: 'bg-yellow-100 text-yellow-700',
  DEMO_SCHEDULED: 'bg-purple-100 text-purple-700',
  ENROLLED: 'bg-green-100 text-green-700',
  NURTURING: 'bg-orange-100 text-orange-700',
  LOST: 'bg-gray-100 text-gray-500',
}

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
        className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_COLORS[lead.status] ?? 'bg-gray-100 text-gray-500'}`}
      >
        {STATUS_LABELS[lead.status] ?? lead.status}
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
        className={`rounded-full border-0 py-0.5 pl-2.5 pr-6 text-xs font-semibold focus:ring-2 focus:ring-primary/20 ${STATUS_COLORS[lead.status] ?? 'bg-gray-100 text-gray-500'}`}
      >
        {Object.entries(STATUS_LABELS).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
    </div>
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
                    {Object.entries(STATUS_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
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
  currentStatus,
  currentQ,
}: {
  leads: LeadRow[]
  total: number
  page: number
  pageSize: number
  canUpdate: boolean
  currentStatus?: string
  currentQ?: string
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const searchRef = useRef<HTMLInputElement>(null)
  const [selectedLead, setSelectedLead] = useState<LeadRow | null>(null)
  const totalPages = Math.ceil(total / pageSize)

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
    router.push(`/admin/leads?${params.toString()}`)
  }

  const goPage = (p: number) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('page', String(p))
    router.push(`/admin/leads?${params.toString()}`)
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
          {Object.entries(STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
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
                  Ngày đăng ký
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {leads.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
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
                    <td className="px-4 py-3 text-sm text-gray-500 tabular-nums">
                      {formatDate(lead.createdAt)}
                    </td>
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
    </div>
  )
}
