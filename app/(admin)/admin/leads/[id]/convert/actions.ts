'use server'

import { createHash } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { scopedDb } from '@/lib/db-scope'
import { resolveActor } from '@/lib/auth/actor'
import { can } from '@/lib/auth/permissions'
import { getAuditActor } from '@/lib/audit/log'
import { isConvertV2Enabled } from '@/lib/flags'
import { convertLeadV2, computeInstallmentSplit, type ConvertV2Student } from '@/lib/crm/convert-lead-v2'
import { recordInstallmentPlan } from '@/lib/orders/installments'
import type { CourseDiscountType } from '@prisma/client'

// ─── R7-05 — wiring Convert v2 vào Server Action (UI → service đã có) ──────────
// KHÔNG nhân đôi logic convert: chỉ chuẩn hoá input từ form → gọi convertLeadV2.
// Giá (listPrice) + discount đọc LẠI từ DB theo classId/discountId (không tin client).

const studentSchema = z.object({
  leadChildId: z.string().trim().optional().nullable(),
  name: z.string().trim().min(1, 'Tên học viên bắt buộc').max(120),
  dob: z.string().trim().optional().or(z.literal('')),
  classId: z.string().trim().min(1, 'Chọn lớp cho học viên'),
  discountId: z.string().trim().optional().or(z.literal('')),
  consentMedia: z.boolean().optional(),
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
  parentEmail: z.string().trim().email('Email phụ huynh không hợp lệ'),
  parentPhone: z.string().trim().min(8, 'SĐT phụ huynh không hợp lệ'),
  students: z.array(studentSchema).min(1, 'Cần ít nhất 1 học viên'),
  installment: installmentSchema,
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
  if (!can(session.user, 'students:create') || !can(session.user, 'enrollments:create')) {
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
  if (!can(session.user, 'leads:view-all') && lead.assignedToId !== session.user.id) {
    return { ok: false, error: 'Chỉ chuyển được lead của bạn' }
  }

  // Đọc giá thật từ lớp + discount từ DB (không tin client gửi giá lên).
  const classIds = [...new Set(d.students.map((s) => s.classId))]
  const discountIds = [...new Set(d.students.map((s) => s.discountId).filter(Boolean) as string[])]
  const [classes, discounts] = await Promise.all([
    sdb.class.findMany({
      where: { id: { in: classIds }, deletedAt: null },
      select: { id: true, courseId: true, course: { select: { price: true } } },
    }),
    discountIds.length
      ? sdb.courseDiscount.findMany({
          where: { id: { in: discountIds }, active: true },
          select: { id: true, type: true, value: true, courseId: true },
        })
      : Promise.resolve([] as { id: string; type: CourseDiscountType; value: number; courseId: string }[]),
  ])
  const classMap = new Map(classes.map((c) => [c.id, c]))
  const discountMap = new Map(discounts.map((x) => [x.id, x]))

  const students: ConvertV2Student[] = []
  for (const s of d.students) {
    const cls = classMap.get(s.classId)
    if (!cls) return { ok: false, error: `Lớp không tồn tại cho học viên "${s.name}"` }
    let discount: { type: CourseDiscountType; value: number } | null = null
    if (s.discountId) {
      const dc = discountMap.get(s.discountId)
      if (!dc) return { ok: false, error: `Ưu đãi không hợp lệ cho học viên "${s.name}"` }
      // Discount phải thuộc đúng khoá của lớp được chọn.
      if (dc.courseId !== cls.courseId) {
        return { ok: false, error: `Ưu đãi không áp dụng cho khoá của lớp đã chọn (${s.name})` }
      }
      discount = { type: dc.type, value: dc.value }
    }
    students.push({
      leadChildId: s.leadChildId || null,
      name: s.name,
      dob: s.dob ? new Date(s.dob) : null,
      courseId: cls.courseId,
      classId: s.classId,
      listPrice: cls.course?.price ?? 0,
      discount,
      consentMedia: s.consentMedia === true,
    })
  }

  // Idempotency key ổn định theo payload (chống double-submit / 2 sale song song).
  const fingerprint = JSON.stringify({
    parentEmail: d.parentEmail.trim().toLowerCase(),
    parentPhone: d.parentPhone.replace(/\D/g, ''),
    students: students.map((s) => ({
      name: s.name.trim().toLowerCase(),
      classId: s.classId,
      courseId: s.courseId,
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
      students,
      idempotencyKey,
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
  }
}
