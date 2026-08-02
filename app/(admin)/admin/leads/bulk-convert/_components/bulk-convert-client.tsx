'use client'

// Bảng chốt hàng loạt: mỗi dòng = 1 học viên (LeadChild), gộp nhóm theo lead.
// Chọn lớp per học viên (lọc đúng khoá quan tâm + cơ sở lead), nhập "đã đóng"
// per lead (tuỳ chọn), rồi chốt theo lô 20 lead/lượt với progress + kết quả dòng.

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { bulkConvertLeadsAction } from '../_actions'

type ChildInfo = {
  id: string
  fullName: string
  dob: string
  gradeLevel: string | null
  interestedCourseId: string | null
  note: string | null
}

type LeadInfo = {
  id: string
  parentName: string
  phone: string
  email: string | null
  centerId: string | null
  note: string | null
  createdAt: string
  children: ChildInfo[]
}

type ClassOption = {
  id: string
  label: string
  courseId: string
  courseName: string
  centerId: string | null
  listPrice: number
}

type CenterInfo = { id: string; name: string; code: string | null }

type RowResult = { ok: boolean; message?: string; warning?: string }

const inputCls =
  'w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500'

const fmtVnd = (n: number) => new Intl.NumberFormat('vi-VN').format(n) + 'đ'

export function BulkConvertClient({
  leads,
  classes,
  centers,
  hasPaymentLeadIds,
}: {
  leads: LeadInfo[]
  classes: ClassOption[]
  centers: CenterInfo[]
  hasPaymentLeadIds: string[]
}) {
  const hasPayment = useMemo(() => new Set(hasPaymentLeadIds), [hasPaymentLeadIds])
  const centerName = useMemo(() => {
    const m = new Map<string, string>()
    for (const c of centers) m.set(c.id, c.code || c.name)
    return m
  }, [centers])
  const classById = useMemo(() => new Map(classes.map((c) => [c.id, c])), [classes])

  // State per lead + per child.
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const [childClass, setChildClass] = useState<Record<string, string>>({})
  const [childConsent, setChildConsent] = useState<Record<string, boolean>>({})
  const [paidAmount, setPaidAmount] = useState<Record<string, string>>({})
  const [paidDate, setPaidDate] = useState<Record<string, string>>({})
  const [results, setResults] = useState<Record<string, RowResult>>({})
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)

  // Bộ lọc hiển thị.
  const [filterCenter, setFilterCenter] = useState('')
  const [search, setSearch] = useState('')
  const [hideDone, setHideDone] = useState(true)

  // Helper gán lớp hàng loạt.
  const [bulkClassId, setBulkClassId] = useState('')

  const today = new Date().toISOString().slice(0, 10)

  const visibleLeads = useMemo(() => {
    const q = search.trim().toLowerCase()
    return leads.filter((l) => {
      if (results[l.id]?.ok && hideDone) return false
      if (filterCenter && l.centerId !== filterCenter) return false
      if (!q) return true
      return (
        l.parentName.toLowerCase().includes(q) ||
        l.phone.includes(q) ||
        l.children.some((c) => c.fullName.toLowerCase().includes(q))
      )
    })
  }, [leads, filterCenter, search, results, hideDone])

  const classesFor = (lead: LeadInfo, child: ChildInfo) =>
    classes.filter(
      (c) =>
        c.centerId === lead.centerId &&
        (!child.interestedCourseId || c.courseId === child.interestedCourseId),
    )

  const leadTotal = (lead: LeadInfo) =>
    lead.children.reduce((s, ch) => {
      const cls = childClass[ch.id] ? classById.get(childClass[ch.id]!) : null
      return s + (cls?.listPrice ?? 0)
    }, 0)

  const toggleLead = (id: string, on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })

  const selectAllVisible = (on: boolean) =>
    setSelected(() => {
      if (!on) return new Set()
      return new Set(visibleLeads.filter((l) => l.children.length > 0 && !results[l.id]?.ok).map((l) => l.id))
    })

  const applyBulkClass = () => {
    const cls = bulkClassId ? classById.get(bulkClassId) : null
    if (!cls) return
    let applied = 0
    setChildClass((prev) => {
      const next = { ...prev }
      for (const lead of visibleLeads) {
        if (lead.centerId !== cls.centerId) continue
        for (const ch of lead.children) {
          if (next[ch.id]) continue // không ghi đè lựa chọn đã có
          if (ch.interestedCourseId && ch.interestedCourseId !== cls.courseId) continue
          next[ch.id] = cls.id
          applied++
        }
      }
      return next
    })
    toast.success(`Đã gán lớp cho ${applied} học viên (chưa gán, cùng khoá & cơ sở)`)
  }

  const consentAllVisible = (on: boolean) =>
    setChildConsent((prev) => {
      const next = { ...prev }
      for (const lead of visibleLeads) for (const ch of lead.children) next[ch.id] = on
      return next
    })

  const fillPaidListPrice = () => {
    setPaidAmount((prev) => {
      const next = { ...prev }
      for (const lead of visibleLeads) {
        if (!selected.has(lead.id) || hasPayment.has(lead.id)) continue
        const total = leadTotal(lead)
        if (total > 0) next[lead.id] = String(total)
      }
      return next
    })
  }

  const readyLeads = useMemo(
    () =>
      visibleLeads.filter(
        (l) =>
          selected.has(l.id) &&
          !results[l.id]?.ok &&
          l.children.length > 0 &&
          l.children.every((ch) => Boolean(childClass[ch.id])),
      ),
    [visibleLeads, selected, results, childClass],
  )

  const submit = async () => {
    if (readyLeads.length === 0) {
      toast.error('Chưa có lead nào đủ điều kiện (cần chọn lớp cho mọi học viên của lead đã tick)')
      return
    }
    setRunning(true)
    setProgress({ done: 0, total: readyLeads.length })
    let okCount = 0
    let failCount = 0
    try {
      const CHUNK = 20
      for (let i = 0; i < readyLeads.length; i += CHUNK) {
        const chunk = readyLeads.slice(i, i + CHUNK)
        const payload = {
          items: chunk.map((lead) => ({
            leadId: lead.id,
            students: lead.children.map((ch) => ({
              leadChildId: ch.id,
              name: ch.fullName,
              dob: ch.dob || '',
              classId: childClass[ch.id]!,
              consentMedia: childConsent[ch.id] === true,
            })),
            paid:
              !hasPayment.has(lead.id) && Number(paidAmount[lead.id] ?? '') > 0
                ? {
                    amount: Math.round(Number(paidAmount[lead.id])),
                    paidDate: paidDate[lead.id] || today,
                    note: '',
                  }
                : null,
          })),
        }
        const res = await bulkConvertLeadsAction(payload)
        if (!res.ok) {
          toast.error(res.error)
          for (const lead of chunk) {
            setResults((prev) => ({ ...prev, [lead.id]: { ok: false, message: res.error } }))
            failCount++
          }
        } else {
          setResults((prev) => {
            const next = { ...prev }
            for (const r of res.results) {
              next[r.leadId] = { ok: r.ok, message: r.message, warning: r.warning }
              if (r.ok) okCount++
              else failCount++
            }
            return next
          })
        }
        setProgress({ done: Math.min(i + CHUNK, readyLeads.length), total: readyLeads.length })
      }
      if (failCount === 0) toast.success(`Đã chốt ${okCount} lead`)
      else toast.warning(`Xong: ${okCount} thành công · ${failCount} lỗi — xem cột kết quả`)
    } finally {
      setRunning(false)
    }
  }

  const doneCount = Object.values(results).filter((r) => r.ok).length

  return (
    <div className="space-y-4">
      {/* Thanh công cụ */}
      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Cơ sở</label>
          <select value={filterCenter} onChange={(e) => setFilterCenter(e.target.value)} className={inputCls}>
            <option value="">Tất cả</option>
            {centers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code || c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-[200px] flex-1">
          <label className="mb-1 block text-xs font-medium text-gray-600">Tìm (tên PH / SĐT / tên HV)</label>
          <input value={search} onChange={(e) => setSearch(e.target.value)} className={inputCls} placeholder="Gõ để lọc…" />
        </div>
        <div className="min-w-[260px]">
          <label className="mb-1 block text-xs font-medium text-gray-600">Gán lớp nhanh (HV chưa gán, cùng khoá & cơ sở)</label>
          <div className="flex gap-2">
            <select value={bulkClassId} onChange={(e) => setBulkClassId(e.target.value)} className={inputCls}>
              <option value="">— Chọn lớp —</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  [{(c.centerId && centerName.get(c.centerId)) || '?'}] {c.label} · {c.courseName}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={applyBulkClass}
              disabled={!bulkClassId || running}
              className="shrink-0 rounded-md bg-gray-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
            >
              Áp dụng
            </button>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <button type="button" onClick={() => selectAllVisible(true)} disabled={running} className="rounded-md border border-gray-300 px-2.5 py-1 hover:bg-gray-50">
          Tick tất cả đang hiển thị
        </button>
        <button type="button" onClick={() => selectAllVisible(false)} disabled={running} className="rounded-md border border-gray-300 px-2.5 py-1 hover:bg-gray-50">
          Bỏ tick
        </button>
        <button type="button" onClick={() => consentAllVisible(true)} disabled={running} className="rounded-md border border-gray-300 px-2.5 py-1 hover:bg-gray-50">
          Đồng ý ảnh: tick tất cả
        </button>
        <button type="button" onClick={fillPaidListPrice} disabled={running} className="rounded-md border border-gray-300 px-2.5 py-1 hover:bg-gray-50">
          Điền &quot;đã đóng&quot; = học phí niêm yết (lead đã tick)
        </button>
        <label className="ml-auto inline-flex items-center gap-1.5 text-gray-600">
          <input type="checkbox" checked={hideDone} onChange={(e) => setHideDone(e.target.checked)} className="h-4 w-4 rounded border-gray-300" />
          Ẩn lead đã chốt xong
        </label>
      </div>

      {/* Bảng */}
      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full min-w-[1080px] text-sm">
          <thead className="bg-gray-50 text-left text-xs font-medium uppercase text-gray-500">
            <tr>
              <th className="w-10 px-3 py-2"></th>
              <th className="px-3 py-2">Phụ huynh</th>
              <th className="px-3 py-2">Học viên</th>
              <th className="w-64 px-3 py-2">Lớp</th>
              <th className="w-24 px-3 py-2">Ảnh: đồng ý</th>
              <th className="w-56 px-3 py-2">Đã đóng (đ) · ngày</th>
              <th className="w-64 px-3 py-2">Kết quả</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {visibleLeads.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-gray-500">
                  {leads.length === 0
                    ? 'Chưa có lead "Đã đăng ký" nào — import file Excel ở màn Import khách đã đăng ký trước.'
                    : 'Không có lead khớp bộ lọc.'}
                </td>
              </tr>
            )}
            {visibleLeads.map((lead) => {
              const res = results[lead.id]
              const rowSpan = Math.max(1, lead.children.length)
              const noChildren = lead.children.length === 0
              const disabled = running || Boolean(res?.ok) || noChildren
              return lead.children.length === 0 ? (
                <tr key={lead.id} className="bg-amber-50/40">
                  <td className="px-3 py-2"></td>
                  <td className="px-3 py-2">
                    <LeadCell lead={lead} centerLabel={(lead.centerId && centerName.get(lead.centerId)) || '—'} />
                  </td>
                  <td colSpan={5} className="px-3 py-2 text-xs text-amber-700">
                    Lead không có học viên đính kèm — chốt riêng tại{' '}
                    <Link href={`/leads/${lead.id}/convert`} className="underline">
                      màn chuyển đổi
                    </Link>
                    .
                  </td>
                </tr>
              ) : (
                lead.children.map((ch, idx) => {
                  const options = classesFor(lead, ch)
                  return (
                    <tr key={ch.id} className={res?.ok ? 'bg-green-50/50' : res ? 'bg-red-50/40' : undefined}>
                      {idx === 0 && (
                        <td className="px-3 py-2 align-top" rowSpan={rowSpan}>
                          <input
                            type="checkbox"
                            checked={selected.has(lead.id)}
                            onChange={(e) => toggleLead(lead.id, e.target.checked)}
                            disabled={disabled}
                            className="mt-1 h-4 w-4 rounded border-gray-300"
                          />
                        </td>
                      )}
                      {idx === 0 && (
                        <td className="px-3 py-2 align-top" rowSpan={rowSpan}>
                          <LeadCell lead={lead} centerLabel={(lead.centerId && centerName.get(lead.centerId)) || '—'} />
                        </td>
                      )}
                      <td className="px-3 py-2 align-top">
                        <div className="font-medium text-gray-900">{ch.fullName}</div>
                        <div className="text-xs text-gray-500">
                          {[ch.gradeLevel, ch.dob].filter(Boolean).join(' · ')}
                        </div>
                        {ch.note && (
                          <div className="mt-0.5 max-w-[220px] truncate text-xs text-gray-400" title={ch.note}>
                            {ch.note}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2 align-top">
                        <select
                          value={childClass[ch.id] ?? ''}
                          onChange={(e) => setChildClass((prev) => ({ ...prev, [ch.id]: e.target.value }))}
                          disabled={disabled}
                          className={inputCls}
                        >
                          <option value="">— Chọn lớp —</option>
                          {options.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.label} · {c.courseName} · {fmtVnd(c.listPrice)}
                            </option>
                          ))}
                        </select>
                        {options.length === 0 && (
                          <div className="mt-0.5 text-xs text-red-600">
                            Chưa có lớp mở cùng khoá tại cơ sở này — tạo lớp trước.
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-center align-top">
                        <input
                          type="checkbox"
                          checked={childConsent[ch.id] === true}
                          onChange={(e) => setChildConsent((prev) => ({ ...prev, [ch.id]: e.target.checked }))}
                          disabled={disabled}
                          className="mt-1 h-4 w-4 rounded border-gray-300"
                        />
                      </td>
                      {idx === 0 && (
                        <td className="px-3 py-2 align-top" rowSpan={rowSpan}>
                          {hasPayment.has(lead.id) ? (
                            <span className="inline-flex rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                              Đã có khoản ghi nhận
                            </span>
                          ) : (
                            <div className="space-y-1">
                              <input
                                type="number"
                                min={0}
                                step={1000}
                                value={paidAmount[lead.id] ?? ''}
                                onChange={(e) => setPaidAmount((prev) => ({ ...prev, [lead.id]: e.target.value }))}
                                disabled={disabled}
                                placeholder="Bỏ trống nếu chưa rõ"
                                className={inputCls}
                              />
                              <input
                                type="date"
                                value={paidDate[lead.id] ?? today}
                                max={today}
                                onChange={(e) => setPaidDate((prev) => ({ ...prev, [lead.id]: e.target.value }))}
                                disabled={disabled}
                                className={inputCls}
                              />
                              {Number(paidAmount[lead.id] ?? '') > 0 && leadTotal(lead) > 0 && (
                                <div className="text-xs text-gray-500">
                                  Niêm yết: {fmtVnd(leadTotal(lead))}
                                </div>
                              )}
                            </div>
                          )}
                        </td>
                      )}
                      {idx === 0 && (
                        <td className="px-3 py-2 align-top text-xs" rowSpan={rowSpan}>
                          {res?.ok && (
                            <div className="text-green-700">
                              ✓ Đã chốt{res.warning ? ` — ${res.warning}` : ''}
                            </div>
                          )}
                          {res && !res.ok && <div className="text-red-600">✗ {res.message}</div>}
                          {!res && lead.note && (
                            <div className="max-w-[240px] truncate text-gray-400" title={lead.note}>
                              {lead.note}
                            </div>
                          )}
                        </td>
                      )}
                    </tr>
                  )
                })
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Thanh hành động */}
      <div className="sticky bottom-0 flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
        <div className="text-sm text-gray-600">
          Đã tick: <span className="font-semibold">{selected.size}</span> · Đủ điều kiện:{' '}
          <span className="font-semibold">{readyLeads.length}</span>
          {doneCount > 0 && (
            <>
              {' '}
              · Đã chốt: <span className="font-semibold text-green-700">{doneCount}</span>
            </>
          )}
        </div>
        {progress && running && (
          <div className="text-sm text-gray-600">
            Đang chốt… {progress.done}/{progress.total}
          </div>
        )}
        <button
          type="button"
          onClick={submit}
          disabled={running || readyLeads.length === 0}
          className="ml-auto rounded-md bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-700 disabled:opacity-50"
        >
          {running ? 'Đang chốt…' : `Chốt ${readyLeads.length} lead`}
        </button>
      </div>

      <p className="text-xs text-gray-500">
        Sau khi chốt: tài khoản phụ huynh ở trạng thái <b>chờ kích hoạt</b> — phụ huynh vào{' '}
        <span className="font-mono">hocvien.satarobo.vn/kich-hoat</span>, nhập SĐT để nhận mã OTP
        qua Zalo và tự đặt mật khẩu. Quản lý danh sách chờ kích hoạt tại màn{' '}
        <Link href="/students/tai-khoan" className="underline">
          Tài khoản phụ huynh
        </Link>
        .
      </p>
    </div>
  )
}

function LeadCell({ lead, centerLabel }: { lead: LeadInfo; centerLabel: string }) {
  return (
    <div>
      <Link href={`/leads/${lead.id}`} className="font-medium text-gray-900 hover:underline">
        {lead.parentName}
      </Link>
      <div className="text-xs text-gray-500">
        {lead.phone} · {centerLabel}
      </div>
      <div className="text-xs text-gray-400">Đăng ký: {lead.createdAt}</div>
    </div>
  )
}
