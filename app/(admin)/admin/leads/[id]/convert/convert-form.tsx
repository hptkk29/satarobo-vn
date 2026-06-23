'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Trash2, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { submitConvertV2 } from './actions'

type ClassOpt = {
  id: string
  label: string
  courseId: string
  courseName: string
  listPrice: number
}

type StudentRow = {
  key: string
  leadChildId: string | null
  name: string
  dob: string
  classId: string
  discountId: string
  consentMedia: boolean
}

const inputCls =
  'w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-400'

function newKey() {
  return Math.random().toString(36).slice(2)
}

export function ConvertForm({
  leadId,
  defaultParentName,
  defaultParentEmail,
  defaultParentPhone,
  prefillStudents,
  classes,
  discountsByCourse,
  order,
}: {
  leadId: string
  defaultParentName: string
  defaultParentEmail: string
  defaultParentPhone: string
  prefillStudents: {
    leadChildId: string | null
    name: string
    dob: string
    courseId: string
  }[]
  classes: ClassOpt[]
  discountsByCourse: Record<string, { id: string; label: string }[]>
  /** FL2-01 — đơn hàng học phí gắn lead (để chia 1/2 đợt). null = chưa có đơn. */
  order: { id: string; totalAmount: number } | null
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [conflict, setConflict] = useState<string | null>(null)

  const [parentName, setParentName] = useState(defaultParentName)
  const [parentEmail, setParentEmail] = useState(defaultParentEmail)
  const [parentPhone, setParentPhone] = useState(defaultParentPhone)

  // FL2-01 — kế hoạch học phí. Chỉ áp dụng khi có Order với tổng > 0.
  const hasOrder = !!order && order.totalAmount > 0
  const orderTotal = order?.totalAmount ?? 0
  const [installPlan, setInstallPlan] = useState<'FULL' | 'TWO'>('FULL')
  const [dot1Amount, setDot1Amount] = useState('')
  const [dot2DueDate, setDot2DueDate] = useState('')
  const dot1Num = Math.min(Math.max(0, Number.parseInt(dot1Amount || '0', 10) || 0), orderTotal)
  const dot2Num = Math.max(0, orderTotal - dot1Num)

  const [students, setStudents] = useState<StudentRow[]>(() =>
    (prefillStudents.length ? prefillStudents : [{ leadChildId: null, name: '', dob: '', courseId: '' }]).map(
      (s) => {
        // Prefill class: nếu con có khoá quan tâm, chọn lớp đầu tiên của khoá đó.
        const cls = s.courseId ? classes.find((c) => c.courseId === s.courseId) : undefined
        return {
          key: newKey(),
          leadChildId: s.leadChildId,
          name: s.name,
          dob: s.dob,
          classId: cls?.id ?? '',
          discountId: '',
          consentMedia: false,
        }
      },
    ),
  )

  const classById = useMemo(() => new Map(classes.map((c) => [c.id, c])), [classes])

  function patch(key: string, p: Partial<StudentRow>) {
    setStudents((rows) => rows.map((r) => (r.key === key ? { ...r, ...p } : r)))
  }

  function addStudent() {
    setStudents((rows) => [
      ...rows,
      { key: newKey(), leadChildId: null, name: '', dob: '', classId: '', discountId: '', consentMedia: false },
    ])
  }

  function removeStudent(key: string) {
    setStudents((rows) => (rows.length > 1 ? rows.filter((r) => r.key !== key) : rows))
  }

  function submit() {
    if (!parentName.trim() || !parentEmail.trim() || !parentPhone.trim()) {
      toast.error('Nhập đủ tên / email / SĐT phụ huynh')
      return
    }
    if (students.some((s) => !s.name.trim() || !s.classId)) {
      toast.error('Mỗi học viên cần tên + lớp')
      return
    }
    if (hasOrder && installPlan === 'TWO' && !dot2DueDate) {
      toast.error('Chọn 2 đợt thì cần ngày hẹn đóng đợt 2')
      return
    }
    setConflict(null)
    startTransition(async () => {
      const res = await submitConvertV2(leadId, {
        parentName: parentName.trim(),
        parentEmail: parentEmail.trim(),
        parentPhone: parentPhone.trim(),
        students: students.map((s) => ({
          leadChildId: s.leadChildId,
          name: s.name.trim(),
          dob: s.dob || '',
          classId: s.classId,
          discountId: s.discountId || '',
          consentMedia: s.consentMedia,
        })),
        // FL2-01 — chỉ gửi khi có đơn để chia; server đọc lại tổng từ Order.
        installment: hasOrder
          ? { plan: installPlan, dot1Amount: dot1Num, dot2DueDate: installPlan === 'TWO' ? dot2DueDate : '' }
          : null,
      })
      if (res.ok) {
        toast.success(
          `Đã chuyển đổi: ${res.studentIds.length} học viên · ${res.enrollmentIds.length} đăng ký` +
            (res.deduped ? ' (đã xử lý trùng / idempotent)' : ''),
        )
        if (res.installmentWarning) toast.warning(res.installmentWarning)
        else if (res.installmentApplied) toast.success('Đã ghi kế hoạch học phí 2 đợt')
        router.push(`/leads/${leadId}`)
        router.refresh()
        return
      }
      // Lỗi nghiệp vụ — hiển thị rõ ràng.
      if (res.code === 'PARENT_CONFLICT') {
        setConflict(res.error)
        toast.error('Xung đột hồ sơ phụ huynh — chuyển Admin xử lý')
        return
      }
      if (res.code === 'PAYMENT_REQUIRED') {
        toast.error('Chưa đủ điều kiện: cần ghi nhận thanh toán trước khi chốt (PAYMENT_REQUIRED)')
        return
      }
      toast.error(res.error || 'Lỗi chuyển đổi')
    })
  }

  return (
    <div className="space-y-6">
      {conflict && (
        <div className="flex items-start gap-2 rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-semibold">Xung đột hồ sơ phụ huynh</p>
            <p>{conflict}</p>
            <a href="/convert-conflicts" className="mt-1 inline-block font-medium underline">
              Mở màn xử lý xung đột →
            </a>
          </div>
        </div>
      )}

      {/* Phụ huynh */}
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-gray-700">Phụ huynh</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-500">Họ tên *</span>
            <input value={parentName} onChange={(e) => setParentName(e.target.value)} className={inputCls} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-500">Email *</span>
            <input
              type="email"
              value={parentEmail}
              onChange={(e) => setParentEmail(e.target.value)}
              className={inputCls}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-500">SĐT *</span>
            <input value={parentPhone} onChange={(e) => setParentPhone(e.target.value)} className={inputCls} />
          </label>
        </div>
      </div>

      {/* Học viên (multi) */}
      <div className="space-y-4">
        {students.map((s, idx) => {
          const cls = classById.get(s.classId)
          const courseDiscounts = cls ? discountsByCourse[cls.courseId] ?? [] : []
          return (
            <div key={s.key} className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-700">
                  Học viên {idx + 1}
                  {s.leadChildId && <span className="ml-2 text-xs text-gray-400">(từ lead)</span>}
                </h3>
                {students.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeStudent(s.key)}
                    className="inline-flex items-center gap-1 text-xs text-red-500 hover:text-red-700"
                  >
                    <Trash2 size={14} /> Xoá
                  </button>
                )}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-gray-500">Tên học viên *</span>
                  <input
                    value={s.name}
                    onChange={(e) => patch(s.key, { name: e.target.value })}
                    className={inputCls}
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-gray-500">Ngày sinh</span>
                  <input
                    type="date"
                    value={s.dob}
                    onChange={(e) => patch(s.key, { dob: e.target.value })}
                    className={inputCls}
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-gray-500">Lớp đăng ký *</span>
                  <select
                    value={s.classId}
                    onChange={(e) => patch(s.key, { classId: e.target.value, discountId: '' })}
                    className={inputCls}
                  >
                    <option value="">— Chọn lớp —</option>
                    {classes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label} · {c.courseName} ({c.listPrice.toLocaleString('vi-VN')}đ)
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-gray-500">Ưu đãi (tuỳ chọn)</span>
                  <select
                    value={s.discountId}
                    onChange={(e) => patch(s.key, { discountId: e.target.value })}
                    className={inputCls}
                    disabled={!cls || courseDiscounts.length === 0}
                  >
                    <option value="">— Không ưu đãi —</option>
                    {courseDiscounts.map((dc) => (
                      <option key={dc.id} value={dc.id}>
                        {dc.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="mt-3 flex items-start gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={s.consentMedia}
                  onChange={(e) => patch(s.key, { consentMedia: e.target.checked })}
                  className="mt-0.5 h-4 w-4 rounded border-gray-300"
                />
                <span>
                  Phụ huynh đồng ý cho trung tâm sử dụng hình ảnh/video của học viên trong lớp cho mục
                  đích lưu trữ & truyền thông (NĐ 13/2023). Người tick &amp; thời điểm sẽ được ghi nhật ký.
                </span>
              </label>
            </div>
          )
        })}
      </div>

      <button
        type="button"
        onClick={addStudent}
        className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-gray-300 px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
      >
        <Plus size={14} /> Thêm học viên
      </button>

      {classes.length === 0 && (
        <p className="text-xs text-amber-600">
          Chưa có lớp nào đang mở (cùng cơ sở lead). Tạo lớp ở mục Lớp học trước khi chốt.
        </p>
      )}

      {/* FL2-01 — Học phí: 1 đợt (full) hoặc 2 đợt (đợt 1 đã thu + đợt 2 hẹn ngày). */}
      {hasOrder && (
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <h2 className="mb-1 text-sm font-semibold text-gray-700">Học phí</h2>
          <p className="mb-3 text-xs text-gray-500">
            Tổng đơn hàng: <strong>{orderTotal.toLocaleString('vi-VN')}đ</strong>
          </p>
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="radio"
                name="install-plan"
                checked={installPlan === 'FULL'}
                onChange={() => setInstallPlan('FULL')}
                className="h-4 w-4"
              />
              Đóng đủ 1 đợt
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="radio"
                name="install-plan"
                checked={installPlan === 'TWO'}
                onChange={() => setInstallPlan('TWO')}
                className="h-4 w-4"
              />
              Chia 2 đợt
            </label>
          </div>

          {installPlan === 'TWO' && (
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-gray-500">Đợt 1 — đã thu (VNĐ)</span>
                <input
                  type="number"
                  min={0}
                  max={orderTotal}
                  value={dot1Amount}
                  onChange={(e) => setDot1Amount(e.target.value)}
                  placeholder="0"
                  className={inputCls}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-gray-500">Đợt 2 — còn lại</span>
                <input
                  value={`${dot2Num.toLocaleString('vi-VN')}đ`}
                  readOnly
                  className={`${inputCls} bg-gray-50 text-gray-600`}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-gray-500">Đợt 2 — ngày hẹn đóng *</span>
                <input
                  type="date"
                  value={dot2DueDate}
                  onChange={(e) => setDot2DueDate(e.target.value)}
                  className={inputCls}
                />
              </label>
            </div>
          )}
        </div>
      )}

      <div className="flex gap-2 border-t border-gray-200 pt-4">
        <button
          type="button"
          onClick={submit}
          disabled={pending || classes.length === 0}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {pending ? 'Đang xử lý…' : 'Xác nhận chuyển đổi'}
        </button>
        <button
          type="button"
          onClick={() => router.push(`/leads/${leadId}`)}
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Hủy
        </button>
      </div>
    </div>
  )
}
