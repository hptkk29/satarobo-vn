'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Trash2, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { MoneyInput } from '@/components/ui/money-input'
import { HelpHint } from '@/components/admin/ui/help-hint'
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
  consentMedia: boolean
}

const inputCls =
  'w-full rounded-lg border border-border px-3 py-1.5 text-sm focus:border-state-success focus:outline-none focus:ring-1 focus:ring-state-success'

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
  order,
  backHref,
  conflictHref,
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
  /** FL2-01 — đơn hàng học phí gắn lead (để chia 1/2 đợt). null = chưa có đơn. */
  order: { id: string; totalAmount: number } | null
  /**
   * Nơi quay về sau khi chốt xong (và khi bấm Huỷ).
   *
   * Mặc định là clean-URL của host ADMIN. Site Sale mount lại chính form này
   * nhưng `/leads/:id` bên đó không tồn tại — đá về admin host giữa lúc vừa chốt
   * xong là ném người dùng ra khỏi site của họ. Truyền `backHref` để ở lại.
   *
   * Chọn thêm PROP thay vì nhân bản form: nghiệp vụ chốt lead là chỗ đắt nhất để
   * có hai bản (idempotency, atomic-claim, tạo tài khoản PH), và hai bản là hai
   * bản sẽ trôi khác nhau.
   */
  backHref?: string
  /**
   * Đường tới màn xử lý xung đột hồ sơ phụ huynh. `null` = KHÔNG vẽ liên kết —
   * dùng cho site Sale, vì `/convert-conflicts` là màn của Super Admin/Quản lý:
   * vẽ ra cho Sale là một liên kết bấm vào rồi bị đá ra.
   *
   * BẮT BUỘC, không có giá trị mặc định. Hai lý do: (1) chỗ gọi mới là chỗ biết
   * khu của mình có màn đó hay không; (2) `components/admin/nav-coverage.test.ts`
   * dò lối vào của mọi màn admin bằng cách QUÉT CHUỖI `href="..."` — chôn đường
   * dẫn vào một biến mặc định ở đây là làm màn `/convert-conflicts` trông như
   * mồ côi, dù nó vẫn hiện.
   */
  conflictHref: string | null
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  // Mặc định = hành vi admin trước 24/08, không đổi một hạt nào cho chỗ gọi cũ.
  const veLai = backHref ?? `/leads/${leadId}`
  const [conflict, setConflict] = useState<string | null>(null)

  const [parentName, setParentName] = useState(defaultParentName)
  const [parentEmail, setParentEmail] = useState(defaultParentEmail)
  const [parentPhone, setParentPhone] = useState(defaultParentPhone)
  // C5 — CCCD + địa chỉ phụ huynh (lưu trên tài khoản phụ huynh, KHÔNG lưu trên học viên).
  const [parentCccd, setParentCccd] = useState('')
  const [parentAddress, setParentAddress] = useState('')
  const [parentWard, setParentWard] = useState('')
  const [parentCity, setParentCity] = useState('')

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
          consentMedia: false,
        }
      },
    ),
  )

  function patch(key: string, p: Partial<StudentRow>) {
    setStudents((rows) => rows.map((r) => (r.key === key ? { ...r, ...p } : r)))
  }

  function addStudent() {
    setStudents((rows) => [
      ...rows,
      { key: newKey(), leadChildId: null, name: '', dob: '', classId: '', consentMedia: false },
    ])
  }

  function removeStudent(key: string) {
    setStudents((rows) => (rows.length > 1 ? rows.filter((r) => r.key !== key) : rows))
  }

  function submit() {
    // AUTH-SĐT P5 — SĐT là định danh bắt buộc, email tuỳ chọn (kênh dự phòng).
    if (!parentName.trim() || !parentPhone.trim()) {
      toast.error('Nhập đủ tên và SĐT phụ huynh')
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
        parentCccd: parentCccd.trim(),
        parentAddress: parentAddress.trim(),
        parentWard: parentWard.trim(),
        parentCity: parentCity.trim(),
        students: students.map((s) => ({
          leadChildId: s.leadChildId,
          name: s.name.trim(),
          dob: s.dob || '',
          classId: s.classId,
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
        else if (res.installmentPendingApproval)
          toast.info('Kế hoạch 2 đợt đã gửi — chờ quản lý cơ sở duyệt')
        else if (res.installmentApplied) toast.success('Đã ghi kế hoạch học phí 2 đợt')
        router.push(veLai)
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
        <div className="flex items-start gap-2 rounded-xl border border-state-danger bg-state-danger-soft p-4 text-sm text-state-danger-ink">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-semibold">Xung đột hồ sơ phụ huynh</p>
            <p>{conflict}</p>
            {conflictHref ? (
              <a href={conflictHref} className="mt-1 inline-block font-medium underline">
                Mở màn xử lý xung đột →
              </a>
            ) : (
              <p className="mt-1 font-medium">
                Báo quản lý cơ sở xử lý — màn gộp hồ sơ nằm ở khu quản trị.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Phụ huynh */}
      <div className="rounded-xl border border-border bg-card p-4">
        <h2 className="mb-3 text-sm font-semibold text-foreground">Phụ huynh</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">Họ tên *</span>
            <input value={parentName} onChange={(e) => setParentName(e.target.value)} className={inputCls} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">
              Email <span className="font-normal text-muted-foreground">(không bắt buộc)</span>
              <HelpHint>
                Chỉ là kênh dự phòng. Bỏ trống cũng không sao — thông báo và mã kích hoạt
                đi theo số điện thoại.
              </HelpHint>
            </span>
            <input
              type="email"
              value={parentEmail}
              onChange={(e) => setParentEmail(e.target.value)}
              placeholder="Bỏ trống nếu phụ huynh không dùng email"
              className={inputCls}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">
              SĐT * (tài khoản đăng nhập)
              <HelpHint>
                Chính là tên đăng nhập của phụ huynh vào cổng học viên, và là số nhận mã
                kích hoạt qua Zalo. Gõ sai một chữ số là phụ huynh không vào được — sửa
                lại phải nhờ quản trị.
              </HelpHint>
            </span>
            <input value={parentPhone} onChange={(e) => setParentPhone(e.target.value)} className={inputCls} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">CCCD / CMND</span>
            <input
              value={parentCccd}
              onChange={(e) => setParentCccd(e.target.value)}
              placeholder="9 hoặc 12 chữ số"
              className={inputCls}
            />
          </label>
          <label className="block sm:col-span-2">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">Địa chỉ</span>
            <input
              value={parentAddress}
              onChange={(e) => setParentAddress(e.target.value)}
              placeholder="Số nhà, đường…"
              className={inputCls}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">Tỉnh / Thành</span>
            <input value={parentCity} onChange={(e) => setParentCity(e.target.value)} className={inputCls} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">Phường / Xã</span>
            <input value={parentWard} onChange={(e) => setParentWard(e.target.value)} className={inputCls} />
          </label>
        </div>
      </div>

      {/* Học viên (multi) */}
      <div className="space-y-4">
        {students.map((s, idx) => {
          return (
            <div key={s.key} className="rounded-xl border border-border bg-card p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground">
                  Học viên {idx + 1}
                  {s.leadChildId && <span className="ml-2 text-xs text-muted-foreground">(từ lead)</span>}
                </h3>
                {students.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeStudent(s.key)}
                    className="inline-flex items-center gap-1 text-xs text-state-danger-ink hover:text-state-danger-ink"
                  >
                    <Trash2 size={14} /> Xoá
                  </button>
                )}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-muted-foreground">Tên học viên *</span>
                  <input
                    value={s.name}
                    onChange={(e) => patch(s.key, { name: e.target.value })}
                    className={inputCls}
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-muted-foreground">Ngày sinh</span>
                  <input
                    type="date"
                    value={s.dob}
                    onChange={(e) => patch(s.key, { dob: e.target.value })}
                    className={inputCls}
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-muted-foreground">
                    Lớp đăng ký *
                    <HelpHint>
                      Danh sách chỉ có lớp đang mở tại cơ sở của lead. Chốt xong bé vào
                      thẳng lớp này và học phí của lớp thành công nợ của phụ huynh — đổi
                      lớp sau phải làm ở màn Lớp học.
                    </HelpHint>
                  </span>
                  <select
                    value={s.classId}
                    onChange={(e) => patch(s.key, { classId: e.target.value })}
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
              </div>
              <label className="mt-3 flex items-start gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={s.consentMedia}
                  onChange={(e) => patch(s.key, { consentMedia: e.target.checked })}
                  className="mt-0.5 h-4 w-4 rounded border-border"
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
        className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted"
      >
        <Plus size={14} /> Thêm học viên
      </button>

      {classes.length === 0 && (
        <p className="text-xs text-state-warning-ink">
          Chưa có lớp nào đang mở (cùng cơ sở lead). Tạo lớp ở mục Lớp học trước khi chốt.
        </p>
      )}

      {/* FL2-01 — Học phí: 1 đợt (full) hoặc 2 đợt (đợt 1 đã thu + đợt 2 hẹn ngày). */}
      {hasOrder && (
        <div className="rounded-xl border border-border bg-card p-4">
          <h2 className="mb-1 text-sm font-semibold text-foreground">
            Học phí
            <HelpHint className="ml-1">
              Tổng lấy từ đơn hàng đã tạo cho lead này, không sửa được ở đây — muốn đổi
              thì sửa đơn hàng rồi quay lại. Chọn &ldquo;đóng đủ 1 đợt&rdquo; khi phụ
              huynh đóng hết ngay; chọn &ldquo;2 đợt&rdquo; khi còn nợ lại một phần.
            </HelpHint>
          </h2>
          <p className="mb-3 text-xs text-muted-foreground">
            Tổng đơn hàng: <strong>{orderTotal.toLocaleString('vi-VN')}đ</strong>
          </p>
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="radio"
                name="install-plan"
                checked={installPlan === 'FULL'}
                onChange={() => setInstallPlan('FULL')}
                className="h-4 w-4"
              />
              Đóng đủ 1 đợt
            </label>
            <label className="flex items-center gap-2 text-sm text-foreground">
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
                <span className="mb-1 block text-xs font-medium text-muted-foreground">
                  Đợt 1 — đã thu (VNĐ)
                  <HelpHint>
                    Số tiền phụ huynh ĐÃ đóng thật tại thời điểm chốt, không phải số dự
                    kiến. Không được lớn hơn tổng đơn; phần còn lại tự thành đợt 2.
                  </HelpHint>
                </span>
                {/* Ô tiền: gõ 10000000 → hiện 10.000.000. Vẫn giữ state dạng chuỗi để
                    phép kẹp dot1Num (parseInt + clamp theo tổng đơn) không đổi. */}
                <MoneyInput
                  name="dot1Amount"
                  min={0}
                  max={orderTotal}
                  value={dot1Amount}
                  onValueChange={(v) => setDot1Amount(v === null ? '' : String(v))}
                  placeholder="0"
                  // suffix={null}: nhãn đã ghi "(VNĐ)", và `inputCls` mang px-3 nên nó ghi
                  // đè phần lề phải mà MoneyInput chừa cho hậu tố ⇒ hậu tố đè lên chữ số.
                  suffix={null}
                  className={inputCls}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-muted-foreground">
                  Đợt 2 — còn lại
                  <HelpHint>
                    Tự tính = tổng đơn − đợt 1, không gõ tay được. Đây chính là khoản
                    công nợ hệ thống sẽ nhắc phụ huynh trước hạn.
                  </HelpHint>
                </span>
                <input
                  value={`${dot2Num.toLocaleString('vi-VN')}đ`}
                  readOnly
                  className={`${inputCls} bg-muted text-muted-foreground`}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-muted-foreground">
                  Đợt 2 — ngày hẹn đóng *
                  <HelpHint>
                    Ngày phụ huynh hẹn đóng nốt. Hệ thống nhắc công nợ dựa vào ngày này,
                    nên phải là ngày đã thống nhất với phụ huynh chứ không đặt đại.
                  </HelpHint>
                </span>
                <input
                  type="date"
                  value={dot2DueDate}
                  onChange={(e) => setDot2DueDate(e.target.value)}
                  className={inputCls}
                />
              </label>
            </div>
          )}

          {/* C4 — kế hoạch 2 đợt cần quản lý cơ sở duyệt trước khi đợt 2 được tính tiền. */}
          {installPlan === 'TWO' && (
            <p className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-state-warning-soft px-2.5 py-1.5 text-xs font-medium text-state-warning-ink">
              <AlertTriangle className="h-3.5 w-3.5" /> Chờ quản lý cơ sở duyệt
            </p>
          )}
        </div>
      )}

      <div className="flex gap-2 border-t border-border pt-4">
        <button
          type="button"
          onClick={submit}
          disabled={pending || classes.length === 0}
          className="rounded-lg bg-state-success-ink px-4 py-2 text-sm font-semibold text-white hover:bg-state-success-ink-hover disabled:opacity-50"
        >
          {pending ? 'Đang xử lý…' : 'Xác nhận chuyển đổi'}
        </button>
        <button
          type="button"
          onClick={() => router.push(veLai)}
          className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
        >
          Hủy
        </button>
        {/* Hệ quả của việc chốt nằm ở NÚT chứ không ở ô nào — đặt "?" ngay cạnh nút để
            người chốt đọc được trước khi bấm. */}
        <HelpHint className="self-center [&_svg]:size-4" label="Chốt lead nghĩa là gì">
          Bấm chốt là hệ thống tạo hồ sơ học viên, ghi danh vào lớp đã chọn và tạo tài
          khoản phụ huynh ở trạng thái chờ kích hoạt; lead chuyển sang &ldquo;đã chuyển
          đổi&rdquo;. Lỡ bấm hai lần cũng không tạo trùng, nhưng gỡ ra thì phải nhờ quản
          trị — kiểm lại tên bé, lớp và số tiền trước khi bấm.
        </HelpHint>
      </div>
    </div>
  )
}
