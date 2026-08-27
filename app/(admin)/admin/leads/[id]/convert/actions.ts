'use server'

import { createHash } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { scopedDb } from '@/lib/db-scope'
import { resolveActor } from '@/lib/auth/actor'
import { checkPermission } from '@/lib/auth/check-permission'
import { getAuditActor } from '@/lib/audit/log'
import { isConvertV2Enabled } from '@/lib/flags'
import { convertLeadV2, computeInstallmentSplit, type ConvertV2Student } from '@/lib/crm/convert-lead-v2'
import { computeEnrollmentPrice } from '@/lib/finance/pricing'
import { recordInstallmentPlan, requestInstallmentApproval } from '@/lib/orders/installments'
import { phoneVn } from '@/lib/validators/phone'

// ─── R7-05 — wiring Convert v2 vào Server Action (UI → service đã có) ──────────
// KHÔNG nhân đôi logic convert: chỉ chuẩn hoá input từ form → gọi convertLeadV2.
// Giá (listPrice) đọc LẠI từ DB theo classId (không tin client).
// ⚠️ 27/08 — ĐẢO "C6 — bỏ ưu đãi": form nay gửi được ưu đãi/miễn phí từng em. Lý do
// đảo: bỏ ưu đãi khiến tổng phải thu luôn > 0 ⇒ lead miễn phí toàn phần kẹt cứng ở
// guard PAYMENT_REQUIRED, không có đường nào chốt (khoản 0đ cũng không ghi nhận được).

const studentSchema = z.object({
  leadChildId: z.string().trim().optional().nullable(),
  name: z.string().trim().min(1, 'Tên học viên bắt buộc').max(120),
  dob: z.string().trim().optional().or(z.literal('')),
  classId: z.string().trim().min(1, 'Chọn lớp cho học viên'),
  consentMedia: z.boolean().optional(),
  // 27/08 — ƯU ĐÃI TỪNG EM. Trước đây form cố định `discount: null` ⇒ tổng phải thu
  // LUÔN > 0 ⇒ lead miễn phí toàn phần không bao giờ qua nổi guard PAYMENT_REQUIRED
  // (mà khoản 0đ cũng không ghi nhận được — `payments/_actions.ts` chặn amount > 0).
  // Nhánh học bổng toàn phần vốn đã có trong `evaluatePaymentGuard`, chỉ thiếu đường
  // từ UI xuống. `value` là % với PERCENT/SCHOLARSHIP, là VNĐ với AMOUNT/PROGRAM —
  // `computeEnrollmentPrice` tự kẹp (≤ 100% và ≤ giá gốc), server KHÔNG tin giá client.
  discount: z
    .object({
      type: z.enum(['PERCENT', 'AMOUNT', 'SCHOLARSHIP', 'PROGRAM']),
      value: z.number().int().nonnegative(),
    })
    .nullable()
    .optional(),
})

// FL2-01 — kế hoạch học phí: 1 đợt (đóng đủ) hoặc 2 đợt (đợt 1 đã thu + đợt 2 hẹn ngày).
// Số tiền/tổng đọc LẠI từ Order ở server (không tin client) — client chỉ gửi dự định.
const installmentSchema = z
  .object({
    plan: z.enum(['FULL', 'TWO']),
    dot1Amount: z.number().int().nonnegative().optional(),
    dot2DueDate: z.string().trim().optional().or(z.literal('')),
  })
  .optional()
  .nullable()

const convertSchema = z.object({
  parentName: z.string().trim().min(2, 'Tên phụ huynh tối thiểu 2 ký tự').max(120),
  // AUTH-SĐT P5 — email phụ huynh KHÔNG còn bắt buộc. Khoá định danh tài khoản
  // nay là `parentPhone` (canonical, @unique); email chỉ là kênh dự phòng (QĐ-3).
  // Ô trống gửi lên dạng `''` ⇒ chuẩn hoá về `null` ngay tại validator để đường
  // ghi bên dưới không phải phân biệt "" với null.
  parentEmail: z
    .string()
    .trim()
    .email('Email phụ huynh không hợp lệ')
    .optional()
    .or(z.literal(''))
    .transform((v) => (v ? v.toLowerCase() : null)),
  // AUTH-SĐT P1 (gom tồn dư 31/07) — dùng field dùng chung: TRANSFORM ra canonical
  // `84…` thay vì chỉ đo độ dài. Hai hệ quả có chủ đích:
  //   · `d.parentPhone` từ đây trở đi LUÔN canonical ⇒ đường ghi ở convert-lead-v2
  //     và khoá idempotency bên dưới không phải tự chuẩn hoá nữa;
  //   · "0905 123 456" (có khoảng trắng) nay ĐƯỢC nhận thay vì 400 — đúng lỗi
  //     "mất lead im lặng" mà P1 vá.
  // ⚠️ ĐỔI HÀNH VI: số CỐ ĐỊNH (02363…) nay bị TỪ CHỐI. Cố ý — `User.phone` là
  // định danh đăng nhập (@unique) và ZNS/OTP không gửi được vào số bàn, nên tài
  // khoản phụ huynh tạo bằng số cố định sẽ không bao giờ đăng nhập được.
  parentPhone: phoneVn,
  // C5 — CCCD + địa chỉ phụ huynh (lưu trên User, KHÔNG lưu trên Student). Optional/additive.
  parentCccd: z
    .string()
    .trim()
    .regex(/^\d{9}$|^\d{12}$/, 'CCCD/CMND phải có 9 hoặc 12 chữ số')
    .optional()
    .or(z.literal('')),
  parentAddress: z.string().trim().max(255).optional().or(z.literal('')),
  parentWard: z.string().trim().max(120).optional().or(z.literal('')),
  parentCity: z.string().trim().max(120).optional().or(z.literal('')),
  students: z.array(studentSchema).min(1, 'Cần ít nhất 1 học viên'),
  installment: installmentSchema,
  // Bắt buộc khi có ưu đãi (kiểm dưới, sau khi biết ưu đãi có ăn tiền thật không).
  // Đi vào `AuditLog.reason` của bản ghi STATUS_CHANGE lead → tra được về sau.
  discountReason: z.string().trim().max(300).optional().or(z.literal('')),
})

export type SubmitConvertV2Result =
  | {
      ok: true
      studentIds: string[]
      enrollmentIds: string[]
      deduped: boolean
      /** FL2-01 — đã ghi kế hoạch 2 đợt vào Order chưa (cảnh báo nếu không áp được). */
      installmentApplied?: boolean
      installmentWarning?: string
      /** C4 — kế hoạch 2 đợt đã gửi quản lý cơ sở duyệt (PENDING_APPROVAL). */
      installmentPendingApproval?: boolean
    }
  | { ok: false; code?: string; error: string }

export async function submitConvertV2(
  leadId: string,
  input: unknown,
): Promise<SubmitConvertV2Result> {
  const session = await auth()
  if (!session?.user) return { ok: false, error: 'Chưa đăng nhập' }
  // Flag-gate ở cả server (chống bypass khi flag OFF).
  if (!isConvertV2Enabled()) {
    return { ok: false, error: 'Convert v2 chưa được bật (CONVERT_V2_ENABLED)' }
  }
  // Convert = tạo học viên + đăng ký → cần cả 2 quyền (loại MARKETING ra).
  if (!(await checkPermission('students:create')) || !(await checkPermission('enrollments:create'))) {
    return { ok: false, error: 'Không có quyền chuyển đổi (tạo học viên + đăng ký)' }
  }

  const parsed = convertSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Dữ liệu không hợp lệ' }
  }
  const d = parsed.data

  const sdb = scopedDb(await resolveActor(session.user.id))

  // Scope: lead phải tồn tại; SALE (chỉ view-own) chỉ chuyển lead của mình.
  const lead = await sdb.lead.findFirst({
    where: { id: leadId, deletedAt: null },
    select: { id: true, assignedToId: true },
  })
  if (!lead) return { ok: false, error: 'Lead không tồn tại' }
  if (!(await checkPermission('leads:view-all')) && lead.assignedToId !== session.user.id) {
    return { ok: false, error: 'Chỉ chuyển được lead của bạn' }
  }

  // Đọc giá thật từ lớp ở DB (không tin client gửi giá lên). Client chỉ được gửi LOẠI
  // + MỨC ưu đãi; giá gốc và phép trừ đều làm ở server (`computeEnrollmentPrice`).
  const classIds = [...new Set(d.students.map((s) => s.classId))]
  const classes = await sdb.class.findMany({
    where: { id: { in: classIds }, deletedAt: null },
    select: { id: true, courseId: true, course: { select: { price: true } } },
  })
  const classMap = new Map(classes.map((c) => [c.id, c]))

  const students: ConvertV2Student[] = []
  let totalDiscountAmount = 0
  for (const s of d.students) {
    const cls = classMap.get(s.classId)
    if (!cls) return { ok: false, error: `Lớp không tồn tại cho học viên "${s.name}"` }
    const listPrice = cls.course?.price ?? 0
    // Ưu đãi 0 (hoặc không chọn) coi như KHÔNG có ưu đãi — để `Enrollment.discountType`
    // không bị đóng dấu "PERCENT 0%" gây nhiễu báo cáo.
    const discount = s.discount && s.discount.value > 0 ? s.discount : null
    // Tính lại bằng ĐÚNG hàm mà convertLeadV2 dùng — chỉ để biết ưu đãi có ăn tiền thật
    // không (bắt lý do). Giá ghi vào DB vẫn do convertLeadV2 tự tính, không truyền sang.
    totalDiscountAmount += computeEnrollmentPrice({ listPrice, discount }).discountAmount
    students.push({
      leadChildId: s.leadChildId || null,
      name: s.name,
      dob: s.dob ? new Date(s.dob) : null,
      courseId: cls.courseId,
      classId: s.classId,
      listPrice,
      discount,
      consentMedia: s.consentMedia === true,
    })
  }

  // Ưu đãi làm học phí bốc hơi khỏi công nợ ⇒ phải có người chịu trách nhiệm bằng chữ.
  const discountReason = d.discountReason?.trim() || ''
  if (totalDiscountAmount > 0 && discountReason.length < 10) {
    return {
      ok: false,
      error: 'Có ưu đãi/miễn phí thì phải ghi lý do (tối thiểu 10 ký tự) — lý do được lưu vào nhật ký',
    }
  }

  // Idempotency key ổn định theo payload (chống double-submit / 2 sale song song).
  const fingerprint = JSON.stringify({
    // P5 — email có thể null; đã lowercase ở validator. `null` là một giá trị
    // fingerprint hợp lệ, KHÔNG được thay bằng "" (hai lần bấm "không email" và
    // "email rỗng" phải cho cùng khoá, mà cả hai nay đều về null).
    parentEmail: d.parentEmail,
    // Đã canonical từ `phoneVn` ở schema — KHÔNG chuẩn hoá lần hai.
    // Lợi thêm: hai lần bấm gõ "0905123456" và "+84 905 123 456" nay cho CÙNG một
    // khoá (digit-strip cũ cho hai khoá khác nhau ⇒ chống double-submit hụt).
    parentPhone: d.parentPhone,
    students: students.map((s) => ({
      name: s.name.trim().toLowerCase(),
      classId: s.classId,
      courseId: s.courseId,
      // 27/08 — ƯU ĐÃI VÀO KHOÁ. Không có nó thì: chốt hụt vì thiếu lý do → sửa ưu đãi
      // → bấm lại ⇒ khoá y hệt ⇒ idempotency trả kết quả CŨ (giá cũ) mà báo thành công.
      discount: s.discount ? `${s.discount.type}:${s.discount.value}` : null,
    })),
  })
  const idempotencyKey = `convert:${leadId}:${createHash('sha256')
    .update(fingerprint)
    .digest('hex')
    .slice(0, 16)}`

  const { actorId, actorName } = getAuditActor(session)
  const res = await convertLeadV2(
    { id: actorId, name: actorName },
    {
      leadId,
      parentName: d.parentName,
      parentEmail: d.parentEmail,
      parentPhone: d.parentPhone,
      // C5 — CCCD + địa chỉ phụ huynh (convertLeadV2 ghi vào User, bỏ qua field rỗng).
      parentCccd: d.parentCccd || null,
      parentAddress: d.parentAddress || null,
      parentWard: d.parentWard || null,
      parentCity: d.parentCity || null,
      students,
      idempotencyKey,
      discountReason: discountReason || null,
    },
  )

  if (!res.ok) {
    return { ok: false, code: res.error.code, error: res.error.message }
  }

  // FL2-01 — chọn 2 đợt → NỐI recordInstallmentPlan (tái dùng lib sẵn có). Áp lên Order
  // gắn lead (tạo trước convert ở /orders/new?leadId=...). Tổng đọc từ Order; dot2 =
  // total - dot1 (computeInstallmentSplit) nên luôn khớp ràng buộc của lib. Thất bại ở
  // bước này KHÔNG đảo convert đã commit — chỉ trả cảnh báo để Sale ghi nhận thủ công.
  let installmentApplied: boolean | undefined
  let installmentWarning: string | undefined
  let installmentPendingApproval: boolean | undefined
  if (d.installment?.plan === 'TWO') {
    const order = await sdb.order.findFirst({
      where: { leadId, type: 'COURSE' },
      orderBy: { createdAt: 'desc' },
      select: { id: true, totalAmount: true },
    })
    if (!order || order.totalAmount <= 0) {
      installmentApplied = false
      installmentWarning = 'Chưa có đơn hàng học phí để chia 2 đợt — ghi nhận đợt 2 thủ công ở đơn hàng.'
    } else if (!d.installment.dot2DueDate) {
      installmentApplied = false
      installmentWarning = 'Thiếu ngày hẹn đóng đợt 2 — chưa ghi được kế hoạch 2 đợt.'
    } else {
      const { dot1, dot2 } = computeInstallmentSplit(order.totalAmount, d.installment.dot1Amount ?? 0)
      const plan = await recordInstallmentPlan({
        orderId: order.id,
        dot1Amount: dot1,
        dot2Amount: dot2,
        dot2DueDate: new Date(d.installment.dot2DueDate),
        actorId,
      })
      installmentApplied = plan.ok
      if (!plan.ok) installmentWarning = plan.error
      // C4 — có đợt 2 thực sự (dot2>0) → gửi quản lý cơ sở duyệt (PENDING_APPROVAL).
      // Convert đã commit; đợt 2 chỉ "kích hoạt" ghi Payment sau khi được duyệt.
      if (plan.ok && dot2 > 0) {
        const approval = await requestInstallmentApproval({
          orderId: order.id,
          actor: { id: actorId ?? session.user.id, name: actorName },
        })
        installmentPendingApproval = approval.ok
        if (!approval.ok && !installmentWarning) installmentWarning = approval.error
      }
    }
    revalidatePath('/orders')
  }

  revalidatePath('/leads')
  revalidatePath(`/leads/${leadId}`)
  revalidatePath('/students')
  revalidatePath('/enrollments')
  revalidatePath('/convert-conflicts')
  revalidatePath('/dashboard')
  return {
    ok: true,
    studentIds: res.studentIds,
    enrollmentIds: res.enrollmentIds,
    deduped: res.deduped,
    installmentApplied,
    installmentWarning,
    installmentPendingApproval,
  }
}
