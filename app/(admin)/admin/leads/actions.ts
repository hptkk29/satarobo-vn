'use server'

import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { can, hasRole } from '@/lib/auth/permissions'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { logLeadAudit, logStudentAudit, getAuditActor } from '@/lib/audit/log'
import { autoAssignLead, reassignOpenLeads } from '@/lib/lead/assign'
import { autoAssignNewLead, manualAssignLead, reassignForCenter } from '@/lib/lead/auto-assign'
import { genStudentCode } from '@/lib/codegen'
import { generateOrderCode } from '@/lib/orders/code'
import { requestOtp } from '@/lib/otp/service'
import { enqueueEnrollmentConfirmation } from '@/lib/email/triggers'

const statusSchema = z.enum([
  'NEW',
  'ASSIGNED',
  'CONTACTED',
  'NO_ANSWER',
  'CONSULTING',
  'TRIAL_SCHEDULED',
  'TRIAL_ATTENDED',
  'AWAITING_DECISION',
  'ENROLLED',
  'NURTURING',
  'LOST',
  'DUPLICATE',
  'DEMO_SCHEDULED',
])

export async function updateLeadStatus(
  leadId: string,
  rawStatus: string,
): Promise<{ ok: boolean; error?: string }> {
  const session = await auth()
  if (!session?.user) return { ok: false, error: 'Chua dang nhap' }
  if (!can(session.user, 'leads:edit')) return { ok: false, error: 'Khong co quyen' }

  const parsed = statusSchema.safeParse(rawStatus)
  if (!parsed.success) return { ok: false, error: 'Trang thai khong hop le' }

  const before = await db.lead.findUnique({
    where: { id: leadId },
    select: { status: true, centerId: true },
  })
  if (!before) return { ok: false, error: 'Lead khong ton tai' }

  const { actorId, actorName } = getAuditActor(session)

  await db.$transaction(async (tx) => {
    await tx.lead.update({
      where: { id: leadId },
      data: { status: parsed.data },
    })

    await logLeadAudit({
      leadId,
      action: 'STATUS_CHANGE',
      actorId,
      actorName,
      oldValues: { status: before.status },
      newValues: { status: parsed.data },
      changedFields: ['status'],
      tx,
    })

    // Phase T1.2 — tự sinh activity timeline cho mỗi lần đổi status.
    await tx.leadActivity.create({
      data: {
        leadId,
        actorId,
        actorName,
        type: 'STATUS_CHANGE',
        content: `Chuyển trạng thái: ${before.status} → ${parsed.data}`,
        metadata: { from: before.status, to: parsed.data },
      },
    })

    // Phase T1.4 — vào TRIAL_SCHEDULED → tự tạo lịch học thử (nếu chưa có buổi đang mở).
    if (
      parsed.data === 'TRIAL_SCHEDULED' &&
      before.status !== 'TRIAL_SCHEDULED'
    ) {
      const openTrial = await tx.trialClass.findFirst({
        where: { leadId, status: { in: ['SCHEDULED', 'CONFIRMED', 'POSTPONED'] } },
        select: { id: true },
      })
      if (!openTrial) {
        // Placeholder: ngày mai cùng giờ — GV/admin chỉnh lại lịch thật sau.
        const scheduledAt = new Date(Date.now() + 24 * 60 * 60 * 1000)
        await tx.trialClass.create({
          data: { leadId, centerId: before.centerId, scheduledAt },
        })
        await tx.leadActivity.create({
          data: {
            leadId,
            actorId,
            actorName,
            type: 'NOTE',
            content:
              '[Học thử] Đã tạo lịch học thử (chờ xếp lịch/giáo viên). Vào mục Học thử để cập nhật.',
          },
        })
      }
    }
  })

  revalidatePath('/leads')
  revalidatePath(`/leads/${leadId}`)
  revalidatePath('/trials')
  revalidatePath('/dashboard')
  return { ok: true }
}

// ─── Phase T1.2 — Activity + Task ────────────────────────────────────────────

const activityTypeSchema = z.enum(['CALL', 'MESSAGE', 'NOTE', 'EMAIL'])

export async function addLeadActivity(input: {
  leadId: string
  type: string
  content: string
}): Promise<{ ok: boolean; error?: string }> {
  const session = await auth()
  if (!session?.user) return { ok: false, error: 'Chưa đăng nhập' }
  if (!can(session.user, 'leads:edit')) return { ok: false, error: 'Không có quyền' }

  const parsedType = activityTypeSchema.safeParse(input.type)
  if (!parsedType.success) return { ok: false, error: 'Loại hoạt động không hợp lệ' }
  const content = input.content?.trim()
  if (!content) return { ok: false, error: 'Vui lòng nhập nội dung' }

  const lead = await db.lead.findUnique({
    where: { id: input.leadId },
    select: { id: true },
  })
  if (!lead) return { ok: false, error: 'Lead không tồn tại' }

  const { actorId, actorName } = getAuditActor(session)
  await db.leadActivity.create({
    data: {
      leadId: input.leadId,
      actorId,
      actorName,
      type: parsedType.data,
      content,
    },
  })

  revalidatePath(`/leads/${input.leadId}`)
  return { ok: true }
}

export async function addLeadTask(input: {
  leadId: string
  title: string
  description?: string
  dueAt: string
}): Promise<{ ok: boolean; error?: string }> {
  const session = await auth()
  if (!session?.user) return { ok: false, error: 'Chưa đăng nhập' }
  if (!can(session.user, 'leads:edit')) return { ok: false, error: 'Không có quyền' }

  const title = input.title?.trim()
  if (!title) return { ok: false, error: 'Vui lòng nhập tiêu đề việc' }
  const due = new Date(input.dueAt)
  if (Number.isNaN(due.getTime())) return { ok: false, error: 'Hạn không hợp lệ' }

  const lead = await db.lead.findUnique({
    where: { id: input.leadId },
    select: { id: true, assignedToId: true },
  })
  if (!lead) return { ok: false, error: 'Lead không tồn tại' }

  const { actorId, actorName } = getAuditActor(session)
  await db.leadTask.create({
    data: {
      leadId: input.leadId,
      // Giao cho sale phụ trách lead nếu có, mặc định người tạo.
      assignedToId: lead.assignedToId ?? actorId,
      assignedToName: actorName,
      title,
      description: input.description?.trim() || null,
      dueAt: due,
    },
  })

  revalidatePath(`/leads/${input.leadId}`)
  revalidatePath('/dashboard')
  return { ok: true }
}

export async function completeLeadTask(
  taskId: string,
  done = true,
): Promise<{ ok: boolean; error?: string }> {
  const session = await auth()
  if (!session?.user) return { ok: false, error: 'Chưa đăng nhập' }
  if (!can(session.user, 'leads:edit')) return { ok: false, error: 'Không có quyền' }

  const task = await db.leadTask.findUnique({
    where: { id: taskId },
    select: { leadId: true },
  })
  if (!task) return { ok: false, error: 'Việc không tồn tại' }

  await db.leadTask.update({
    where: { id: taskId },
    data: done
      ? { status: 'DONE', completedAt: new Date() }
      : { status: 'OPEN', completedAt: null },
  })

  revalidatePath(`/leads/${task.leadId}`)
  revalidatePath('/dashboard')
  return { ok: true }
}

export async function updateLeadNote(
  leadId: string,
  note: string,
): Promise<{ ok: boolean; error?: string }> {
  const session = await auth()
  if (!session?.user) return { ok: false, error: 'Chua dang nhap' }
  if (!can(session.user, 'leads:edit')) return { ok: false, error: 'Khong co quyen' }

  const before = await db.lead.findUnique({
    where: { id: leadId },
    select: { note: true },
  })
  if (!before) return { ok: false, error: 'Lead khong ton tai' }

  const newNote = note.trim() || null
  const { actorId, actorName } = getAuditActor(session)

  await db.$transaction(async (tx) => {
    await tx.lead.update({
      where: { id: leadId },
      data: { note: newNote },
    })

    await logLeadAudit({
      leadId,
      action: 'UPDATE',
      actorId,
      actorName,
      oldValues: { note: before.note },
      newValues: { note: newNote },
      changedFields: before.note !== newNote ? ['note'] : [],
      tx,
    })
  })

  revalidatePath('/leads')
  revalidatePath('/dashboard')
  return { ok: true }
}

export async function deleteLead(
  leadId: string,
): Promise<{ ok: boolean; error?: string }> {
  const session = await auth()
  if (!session?.user) return { ok: false, error: 'Chua dang nhap' }
  if (!can(session.user, 'leads:delete')) {
    return { ok: false, error: 'Khong co quyen xoa lead' }
  }

  const before = await db.lead.findUnique({
    where: { id: leadId, deletedAt: null },
    select: { parentName: true, phone: true, status: true },
  })
  if (!before) return { ok: false, error: 'Lead khong ton tai hoac da bi xoa' }

  const { actorId, actorName } = getAuditActor(session)

  try {
    await db.$transaction(async (tx) => {
      await tx.lead.update({
        where: { id: leadId, deletedAt: null },
        data: { deletedAt: new Date() },
      })

      await logLeadAudit({
        leadId,
        action: 'DELETE',
        actorId,
        actorName,
        oldValues: before,
        tx,
      })
    })
  } catch {
    return { ok: false, error: 'Lead khong ton tai hoac da bi xoa' }
  }

  revalidatePath('/leads')
  revalidatePath('/dashboard')
  return { ok: true }
}

// ─── Phase T1.3 — Auto-assign actions ────────────────────────────────────────

export async function autoAssignLeadAction(
  leadId: string,
): Promise<{ ok: boolean; error?: string }> {
  const session = await auth()
  if (!session?.user) return { ok: false, error: 'Chưa đăng nhập' }
  if (!can(session.user, 'leads:assign')) return { ok: false, error: 'Không có quyền' }

  const { actorId, actorName } = getAuditActor(session)
  const res = await autoAssignLead(leadId, { actorId, actorName })
  if (!res.ok) return { ok: false, error: res.error }

  revalidatePath('/leads')
  revalidatePath(`/leads/${leadId}`)
  return { ok: true }
}

export async function reassignLeadsFromAction(
  userId: string,
): Promise<{ ok: boolean; reassigned?: number; error?: string }> {
  const session = await auth()
  if (!session?.user) return { ok: false, error: 'Chưa đăng nhập' }
  if (!can(session.user, 'leads:assign')) return { ok: false, error: 'Không có quyền' }

  const { actorId, actorName } = getAuditActor(session)
  const res = await reassignOpenLeads(userId, { actorId, actorName })
  if (!res.ok) return { ok: false, error: res.error }

  revalidatePath('/leads')
  revalidatePath('/dashboard')
  return { ok: true, reassigned: res.reassigned }
}

// ─── Phase T1.5 — Close deal (lead → Student + Enrollment + ENROLLED) ─────────

const CAPACITY_STATUSES = ['PENDING', 'CONFIRMED', 'STUDYING', 'ACTIVE'] as const

const closeDealSchema = z.object({
  classId: z.string().trim().min(1, 'Vui lòng chọn lớp'),
  studentName: z.string().trim().max(120).optional(),
  tuition: z.number().int().nonnegative().nullable().optional(),
  paid: z.boolean().optional(),
  // C2 — tuỳ chọn cấp tài khoản phụ huynh (portal) ngay khi chốt.
  createParentAccount: z.boolean().optional(),
  parentEmail: z.string().trim().email('Email phụ huynh không hợp lệ').optional().or(z.literal('')),
  parentPassword: z.string().trim().min(8, 'Mật khẩu tối thiểu 8 ký tự').optional().or(z.literal('')),
  // Cụm A3 — học phí + hoá đơn.
  discountAmount: z.number().int().nonnegative().nullable().optional(),
  paymentMethodId: z.string().trim().optional().or(z.literal('')),
  startDate: z.string().trim().optional().or(z.literal('')),
})

export async function closeLeadAsEnrolled(
  leadId: string,
  input: unknown,
): Promise<{
  ok: boolean
  studentId?: string
  studentCode?: string | null
  enrollmentId?: string
  orderCode?: string
  parentAccountEmail?: string
  parentPendingActivation?: boolean
  error?: string
}> {
  const session = await auth()
  if (!session?.user) return { ok: false, error: 'Chưa đăng nhập' }
  // Chốt deal = tạo học viên + đăng ký → cần cả 2 quyền (loại MARKETING ra).
  if (!can(session.user, 'students:create') || !can(session.user, 'enrollments:create')) {
    return { ok: false, error: 'Không có quyền chốt deal (tạo học viên + đăng ký)' }
  }

  const parsed = closeDealSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Dữ liệu không hợp lệ' }
  }
  const { classId, tuition, paid } = parsed.data
  const wantParentAccount = parsed.data.createParentAccount === true

  const lead = await db.lead.findFirst({
    where: { id: leadId, deletedAt: null },
    select: {
      id: true,
      status: true,
      parentName: true,
      childName: true,
      phone: true,
      email: true,
      centerId: true,
      assignedToId: true,
    },
  })
  if (!lead) return { ok: false, error: 'Lead không tồn tại' }
  if (lead.status === 'ENROLLED') {
    return { ok: false, error: 'Lead này đã được chốt (ENROLLED)' }
  }
  // Center scope: SALE (chỉ view-own) chỉ chuyển lead CỦA MÌNH.
  if (!can(session.user, 'leads:view-all') && lead.assignedToId !== session.user.id) {
    return { ok: false, error: 'Chỉ chuyển được lead của bạn' }
  }

  // Lớp đích: kiểm tra tồn tại + còn chỗ.
  const cls = await db.class.findFirst({
    where: { id: classId, deletedAt: null },
    select: {
      id: true,
      courseId: true,
      centerId: true,
      maxStudents: true,
      status: true,
      _count: {
        select: { enrollments: { where: { status: { in: [...CAPACITY_STATUSES] } } } },
      },
    },
  })
  if (!cls) return { ok: false, error: 'Lớp không tồn tại' }
  if (cls.status === 'CANCELLED' || cls.status === 'COMPLETED') {
    return { ok: false, error: `Lớp đang ${cls.status}, không thể đăng ký` }
  }
  if (cls._count.enrollments >= cls.maxStudents) {
    return { ok: false, error: `Lớp đã đủ học viên (${cls.maxStudents} chỗ)` }
  }

  const studentName =
    parsed.data.studentName?.trim() ||
    lead.childName?.trim() ||
    `Con của ${lead.parentName}`
  const { actorId, actorName } = getAuditActor(session)
  const centerId = lead.centerId ?? cls.centerId ?? null

  // A3 — chuẩn bị tài khoản phụ huynh: PENDING_ACTIVATION + OTP email (không đặt
  // mật khẩu tạm). Chống trùng theo EMAIL hoặc SĐT.
  let parentEmail: string | null = null
  if (wantParentAccount) {
    parentEmail =
      (parsed.data.parentEmail?.trim() || lead.email?.trim() || '').toLowerCase() || null
    if (!parentEmail) {
      return { ok: false, error: 'Cần email phụ huynh để cấp tài khoản portal (gửi kích hoạt)' }
    }
    const existing = await db.user.findUnique({
      where: { email: parentEmail },
      select: { role: true },
    })
    if (existing && existing.role !== 'PARENT') {
      return { ok: false, error: 'Email này đã dùng cho tài khoản nhân viên khác' }
    }
  }

  try {
    const result = await db.$transaction(async (tx) => {
      // studentCode tự sinh nếu cơ sở có mã.
      let studentCode: string | undefined
      if (centerId) {
        const center = await tx.center.findUnique({
          where: { id: centerId },
          select: { code: true },
        })
        if (center?.code) studentCode = await genStudentCode(center.code, tx)
      }

      // Tạo / dùng lại tài khoản phụ huynh — chống trùng theo EMAIL hoặc SĐT.
      // Tài khoản mới = PENDING_ACTIVATION (không mật khẩu) → gửi OTP kích hoạt sau tx.
      let parentUserId: string | undefined
      let parentIsNewPending = false
      if (wantParentAccount && parentEmail) {
        const existing = await tx.user.findFirst({
          where: {
            role: 'PARENT',
            deletedAt: null,
            OR: [{ email: parentEmail }, ...(lead.phone ? [{ children: { some: { parentPhone: lead.phone } } }] : [])],
          },
          select: { id: true },
        })
        if (existing) {
          parentUserId = existing.id // dùng lại, KHÔNG reset mật khẩu
        } else {
          const createdUser = await tx.user.create({
            data: {
              name: lead.parentName,
              email: parentEmail,
              role: 'PARENT',
              isActive: true,
              accountStatus: 'PENDING_ACTIVATION',
              tokenVersion: 0,
            },
            select: { id: true },
          })
          parentUserId = createdUser.id
          parentIsNewPending = true
        }
      }

      const student = await tx.student.create({
        data: {
          name: studentName,
          studentCode,
          parentName: lead.parentName,
          parentPhone: lead.phone,
          parentEmail: lead.email ?? undefined,
          parentUserId: parentUserId ?? undefined,
          centerId: centerId ?? undefined,
          preferredCenterId: centerId ?? undefined,
          enrollmentDate: new Date(),
          status: 'ACTIVE',
          notes: `Tạo từ Lead ${lead.id} (chốt deal)`,
        },
        select: { id: true, name: true, studentCode: true, parentName: true, parentPhone: true, centerId: true, status: true },
      })

      await logStudentAudit({
        studentId: student.id,
        action: 'CREATE',
        actorId,
        actorName,
        newValues: {
          name: student.name,
          studentCode: student.studentCode,
          parentName: student.parentName,
          parentPhone: student.parentPhone,
          centerId: student.centerId,
          status: student.status,
        },
        tx,
      })

      const enrollment = await tx.enrollment.create({
        data: {
          student: { connect: { id: student.id } },
          class: { connect: { id: cls.id } },
          course: { connect: { id: cls.courseId } },
          status: 'CONFIRMED',
          confirmedAt: new Date(),
          tuition: tuition ?? null,
          paidAt: paid ? new Date() : null,
          notes: `Chốt từ Lead ${lead.id}`,
        },
        select: { id: true },
      })

      await tx.enrollmentAuditLog.create({
        data: {
          enrollmentId: enrollment.id,
          fromStatus: '—',
          toStatus: 'CONFIRMED',
          changedByUserId: actorId,
          changedByName: actorName,
          reason: `Chốt deal từ Lead ${lead.id}`,
        },
      })

      // A3 — hoá đơn (Order) nếu có dữ liệu học phí.
      let orderId: string | undefined
      let orderCode: string | undefined
      if (tuition != null) {
        const discount = parsed.data.discountAmount ?? 0
        const total = Math.max(0, tuition - discount)
        const code = await generateOrderCode()
        const order = await tx.order.create({
          data: {
            code,
            type: 'COURSE',
            status: paid ? 'CONFIRMED' : 'PENDING_PAYMENT',
            customerName: lead.parentName,
            customerPhone: lead.phone,
            customerEmail: lead.email ?? undefined,
            studentId: student.id,
            leadId: lead.id,
            centerId: centerId ?? undefined,
            paymentMethodId: parsed.data.paymentMethodId || undefined,
            subtotal: tuition,
            discountAmount: discount,
            totalAmount: total,
            paidAt: paid ? new Date() : null,
            confirmedByUserId: paid ? actorId : undefined,
            confirmedAt: paid ? new Date() : undefined,
            internalNote: `Tạo từ chuyển lead ${lead.id}`,
            items: {
              create: {
                type: 'COURSE_ENROLLMENT',
                enrollmentId: enrollment.id,
                itemName: `Học phí lớp ${cls.id}`,
                quantity: 1,
                unitPrice: tuition,
                totalPrice: total,
              },
            },
          },
          select: { id: true, code: true },
        })
        orderId = order.id
        orderCode = order.code
      }

      // A3 — care task "sau đăng ký" cho sale phụ trách.
      await tx.leadTask.create({
        data: {
          leadId,
          assignedToId: lead.assignedToId ?? actorId,
          assignedToName: actorName,
          title: `Chăm sóc sau đăng ký — ${studentName}`,
          description: 'Liên hệ phụ huynh xác nhận lịch học, hướng dẫn kích hoạt tài khoản portal.',
          dueAt: new Date(Date.now() + 2 * 86400000),
        },
      })

      // Lead → ENROLLED + convertedBy + audit + activity.
      await tx.lead.update({
        where: { id: leadId },
        data: { status: 'ENROLLED', convertedById: actorId, convertedAt: new Date() },
      })
      await logLeadAudit({
        leadId,
        action: 'STATUS_CHANGE',
        actorId,
        actorName,
        oldValues: { status: lead.status },
        newValues: { status: 'ENROLLED' },
        changedFields: ['status'],
        tx,
      })
      await tx.leadActivity.create({
        data: {
          leadId,
          actorId,
          actorName,
          type: 'STATUS_CHANGE',
          content: `Chốt deal → tạo học viên "${studentName}"${
            student.studentCode ? ` (${student.studentCode})` : ''
          } + đăng ký lớp.${parentUserId ? ' Đã cấp tài khoản phụ huynh.' : ''}`,
          metadata: { studentId: student.id, enrollmentId: enrollment.id, classId: cls.id },
        },
      })

      // Buổi học thử đang mở → đánh dấu ENROLLED.
      await tx.trialClass.updateMany({
        where: {
          leadId,
          status: { in: ['SCHEDULED', 'CONFIRMED', 'ATTENDED', 'POSTPONED'] },
        },
        data: { status: 'ENROLLED' },
      })

      return {
        studentId: student.id,
        studentCode: student.studentCode,
        studentName: student.name,
        enrollmentId: enrollment.id,
        parentLinked: !!parentUserId,
        parentIsNewPending,
        orderId,
        orderCode,
      }
    })

    // A3 — sau transaction: gửi OTP kích hoạt (tài khoản mới) + email xác nhận đăng ký.
    const linked = result.parentLinked && !!parentEmail
    if (linked && parentEmail) {
      const courseName = await db.class
        .findUnique({ where: { id: classId }, select: { name: true, course: { select: { name: true } } } })
        .catch(() => null)
      // Email xác nhận đăng ký (chỉ con liên quan).
      await enqueueEnrollmentConfirmation({
        to: parentEmail,
        parentName: lead.parentName,
        studentName: result.studentName,
        studentCode: result.studentCode,
        className: courseName?.name ?? '',
        courseName: courseName?.course.name ?? '',
        startDate: parsed.data.startDate || null,
      }).catch(() => {})
      // Tài khoản mới PENDING_ACTIVATION → gửi OTP kích hoạt email.
      if (result.parentIsNewPending) {
        await requestOtp({ target: parentEmail, purpose: 'ACTIVATION' }).catch(() => {})
      }
    }

    revalidatePath('/leads')
    revalidatePath(`/leads/${leadId}`)
    revalidatePath('/students')
    revalidatePath('/enrollments')
    revalidatePath('/orders')
    revalidatePath('/trials')
    revalidatePath('/dashboard')
    revalidatePath('/crm')
    return {
      ok: true,
      studentId: result.studentId,
      studentCode: result.studentCode,
      enrollmentId: result.enrollmentId,
      orderCode: result.orderCode,
      parentAccountEmail: linked ? (parentEmail as string) : undefined,
      // Tài khoản mới cần kích hoạt qua email (OTP đã gửi).
      parentPendingActivation: linked ? result.parentIsNewPending : undefined,
    }
  } catch (err) {
    console.error('[closeLeadAsEnrolled] error:', err)
    return { ok: false, error: 'Lỗi tạo học viên/đăng ký' }
  }
}

/**
 * FIX 4 — Lấy dữ liệu để mở form "Chốt deal" NGAY từ Kanban/table (không cần
 * vào trang chi tiết): tên học viên gợi ý, email PH mặc định, danh sách lớp
 * đang mở (ưu tiên cùng cơ sở với lead).
 */
export async function getLeadCloseDealOptions(leadId: string): Promise<{
  ok: boolean
  error?: string
  defaultStudentName?: string
  defaultParentEmail?: string | null
  classes?: { id: string; label: string; price: number | null }[]
}> {
  const session = await auth()
  if (!session?.user) return { ok: false, error: 'Chưa đăng nhập' }
  if (!can(session.user, 'students:create') || !can(session.user, 'enrollments:create')) {
    return { ok: false, error: 'Không có quyền chốt deal' }
  }

  const lead = await db.lead.findFirst({
    where: { id: leadId, deletedAt: null },
    select: { parentName: true, childName: true, email: true, centerId: true, status: true },
  })
  if (!lead) return { ok: false, error: 'Lead không tồn tại' }
  if (lead.status === 'ENROLLED') return { ok: false, error: 'Lead này đã được chốt' }
  if (lead.status === 'LOST' || lead.status === 'DUPLICATE') {
    return { ok: false, error: `Lead đang ${lead.status} — không thể chốt` }
  }

  const classes = await db.class.findMany({
    where: {
      deletedAt: null,
      status: { in: ['PLANNED', 'RECRUITING', 'ACTIVE'] },
      ...(lead.centerId ? { centerId: lead.centerId } : {}),
    },
    select: { id: true, name: true, classCode: true, course: { select: { price: true } } },
    orderBy: { createdAt: 'desc' },
    take: 100,
  })

  return {
    ok: true,
    defaultStudentName: lead.childName?.trim() || `Con của ${lead.parentName}`,
    defaultParentEmail: lead.email ?? null,
    classes: classes.map((c) => ({
      id: c.id,
      label: c.classCode ? `${c.classCode} · ${c.name}` : c.name,
      price: c.course?.price ?? null,
    })),
  }
}

// ─── Module CRM & Lead PHẦN 1 — CRUD lead thủ công ───────────────────────────

const PHONE_VN_RE = /^(0|\+84)[3|5|7|8|9][0-9]{8}$/

const manualLeadSchema = z.object({
  parentName: z.string().trim().min(2, 'Tên phụ huynh tối thiểu 2 ký tự').max(100),
  phone: z.string().trim().regex(PHONE_VN_RE, 'SĐT không hợp lệ'),
  email: z.string().trim().email('Email không hợp lệ').optional().or(z.literal('')),
  childName: z.string().trim().max(100).optional().or(z.literal('')),
  childAge: z.coerce.number().int().min(3).max(18).optional().nullable(),
  centerId: z.string().trim().optional().or(z.literal('')),
  courseId: z.string().trim().optional().or(z.literal('')),
  source: z.string().trim().min(1).max(100).optional().or(z.literal('')),
  note: z.string().trim().max(2000).optional().or(z.literal('')),
})

/** Tạo 1 lead thủ công (thu ở sự kiện/trung tâm). Chống trùng theo SĐT. */
export async function createLeadManual(
  input: unknown,
): Promise<{ ok: boolean; error?: string; id?: string }> {
  const session = await auth()
  if (!session?.user) return { ok: false, error: 'Chưa đăng nhập' }
  if (!can(session.user, 'leads:create')) return { ok: false, error: 'Không có quyền' }

  const parsed = manualLeadSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Dữ liệu không hợp lệ' }
  }
  const d = parsed.data

  const dup = await db.lead.findFirst({
    where: { phone: d.phone, deletedAt: null },
    select: { id: true },
  })
  if (dup) return { ok: false, error: 'SĐT đã tồn tại trong CRM' }

  const { actorId, actorName } = getAuditActor(session)
  const lead = await db.lead.create({
    data: {
      parentName: d.parentName,
      phone: d.phone,
      email: d.email || null,
      childName: d.childName || null,
      childAge: d.childAge ?? null,
      centerId: d.centerId || null,
      courseId: d.courseId || null,
      source: d.source || 'Nhập tay',
      note: d.note || null,
      status: 'NEW',
      activities: {
        create: {
          actorId,
          actorName,
          type: 'NOTE',
          content: 'Tạo lead thủ công',
          metadata: { system: true },
        },
      },
    },
    select: { id: true },
  })

  // Auto-chia theo cơ sở → chế độ cơ sở (PHẦN 2).
  await autoAssignNewLead(lead.id, { actorId, actorName }).catch(() => {})

  revalidatePath('/leads')
  return { ok: true, id: lead.id }
}

const updateLeadFieldsSchema = manualLeadSchema.partial()

/** Sửa thông tin cơ bản của 1 lead. */
export async function updateLeadFields(
  leadId: string,
  input: unknown,
): Promise<{ ok: boolean; error?: string }> {
  const session = await auth()
  if (!session?.user) return { ok: false, error: 'Chưa đăng nhập' }
  if (!can(session.user, 'leads:edit')) return { ok: false, error: 'Không có quyền' }

  const parsed = updateLeadFieldsSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Dữ liệu không hợp lệ' }
  }
  const d = parsed.data

  const before = await db.lead.findUnique({
    where: { id: leadId },
    select: { id: true, phone: true },
  })
  if (!before) return { ok: false, error: 'Lead không tồn tại' }

  // Đổi SĐT → kiểm tra trùng.
  if (d.phone && d.phone !== before.phone) {
    const dup = await db.lead.findFirst({
      where: { phone: d.phone, deletedAt: null, id: { not: leadId } },
      select: { id: true },
    })
    if (dup) return { ok: false, error: 'SĐT đã tồn tại ở lead khác' }
  }

  await db.lead.update({
    where: { id: leadId },
    data: {
      ...(d.parentName !== undefined ? { parentName: d.parentName } : {}),
      ...(d.phone !== undefined ? { phone: d.phone } : {}),
      ...(d.email !== undefined ? { email: d.email || null } : {}),
      ...(d.childName !== undefined ? { childName: d.childName || null } : {}),
      ...(d.childAge !== undefined ? { childAge: d.childAge ?? null } : {}),
      ...(d.centerId !== undefined ? { centerId: d.centerId || null } : {}),
      ...(d.courseId !== undefined ? { courseId: d.courseId || null } : {}),
      ...(d.source !== undefined ? { source: d.source || null } : {}),
      ...(d.note !== undefined ? { note: d.note || null } : {}),
    },
  })

  revalidatePath(`/leads/${leadId}`)
  revalidatePath('/leads')
  return { ok: true }
}

// ─── Module CRM & Lead PHẦN 2 — gán tay + auto-chia + cấu hình chế độ ─────────

/** Auto-chia 1 lead theo cơ sở → chế độ (tôn trọng khoá khi đã tương tác). */
export async function autoAssignNewLeadAction(
  leadId: string,
): Promise<{ ok: boolean; error?: string }> {
  const session = await auth()
  if (!session?.user) return { ok: false, error: 'Chưa đăng nhập' }
  if (!can(session.user, 'leads:assign')) return { ok: false, error: 'Không có quyền' }

  const { actorId, actorName } = getAuditActor(session)
  const res = await autoAssignNewLead(leadId, { actorId, actorName })
  if (!res.ok) return { ok: false, error: res.error }

  revalidatePath('/leads')
  revalidatePath(`/leads/${leadId}`)
  return { ok: true }
}

/** Quản lý gán tay 1 lead cho 1 sale cụ thể. */
export async function assignLeadToSaleAction(
  leadId: string,
  saleId: string,
): Promise<{ ok: boolean; error?: string }> {
  const session = await auth()
  if (!session?.user) return { ok: false, error: 'Chưa đăng nhập' }
  if (!can(session.user, 'leads:assign')) return { ok: false, error: 'Không có quyền' }

  const { actorId, actorName } = getAuditActor(session)
  const res = await manualAssignLead(leadId, saleId, { actorId, actorName })
  if (!res.ok) return res

  revalidatePath('/leads')
  revalidatePath(`/leads/${leadId}`)
  return { ok: true }
}

const ASSIGN_MODES = ['ROUND_ROBIN', 'CLOSE_RATE', 'MANUAL'] as const

/** Quản lý cơ sở đặt chế độ chia cho cơ sở mình; SUPER_ADMIN đặt mọi cơ sở. */
export async function setCenterAssignModeAction(
  centerId: string,
  mode: string,
): Promise<{ ok: boolean; error?: string }> {
  const session = await auth()
  if (!session?.user) return { ok: false, error: 'Chưa đăng nhập' }
  if (!can(session.user, 'leads:assign')) return { ok: false, error: 'Không có quyền' }

  if (!ASSIGN_MODES.includes(mode as (typeof ASSIGN_MODES)[number])) {
    return { ok: false, error: 'Chế độ không hợp lệ' }
  }

  // CENTER_MANAGER (không kèm SUPER_ADMIN) chỉ đặt cơ sở mình.
  const isSuper = hasRole(session.user, 'SUPER_ADMIN')
  if (!isSuper && hasRole(session.user, 'CENTER_MANAGER') && session.user.centerId !== centerId) {
    return { ok: false, error: 'Chỉ đặt được cơ sở của bạn' }
  }

  await db.leadAssignmentConfig.upsert({
    where: { centerId },
    create: { centerId, mode: mode as (typeof ASSIGN_MODES)[number] },
    update: { mode: mode as (typeof ASSIGN_MODES)[number] },
  })

  revalidatePath('/leads/cau-hinh-chia')
  return { ok: true }
}

// ─── Module CRM & Lead PHẦN 3 — chuyển lead + note bàn giao bắt buộc ──────────

const transferSchema = z.object({
  leadId: z.string().min(1),
  toSaleId: z.string().trim().optional().or(z.literal('')),
  toCenterId: z.string().trim().optional().or(z.literal('')),
  handoverNote: z.string().trim().min(5, 'Bắt buộc ghi đã tư vấn gì cho khách (≥5 ký tự)').max(2000),
  reason: z.string().trim().max(500).optional().or(z.literal('')),
})

export async function transferLead(
  input: unknown,
): Promise<{ ok: boolean; error?: string }> {
  const session = await auth()
  if (!session?.user) return { ok: false, error: 'Chưa đăng nhập' }
  if (!can(session.user, 'leads:edit')) return { ok: false, error: 'Không có quyền' }

  const parsed = transferSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Dữ liệu không hợp lệ' }
  }
  const d = parsed.data

  const lead = await db.lead.findFirst({
    where: { id: d.leadId, deletedAt: null },
    select: { id: true, assignedToId: true, centerId: true, status: true },
  })
  if (!lead) return { ok: false, error: 'Lead không tồn tại' }

  // SALE (chỉ view-own) chỉ tự chuyển lead của mình.
  if (!can(session.user, 'leads:view-all') && lead.assignedToId !== session.user.id) {
    return { ok: false, error: 'Chỉ chuyển được lead của bạn' }
  }

  const toCenterId = d.toCenterId || lead.centerId || null
  const centerChanged = !!toCenterId && toCenterId !== lead.centerId

  // Xác định sale nhận.
  let toSaleId: string | null = null
  if (d.toSaleId) {
    const sale = await db.user.findFirst({
      where: { id: d.toSaleId, roles: { has: 'SALES_CSM' }, deletedAt: null },
      select: { id: true },
    })
    if (!sale) return { ok: false, error: 'Sale nhận không hợp lệ' }
    toSaleId = sale.id
  } else if (centerChanged && toCenterId) {
    // Đổi cơ sở, không chỉ định người → chia theo chế độ cơ sở mới.
    toSaleId = await reassignForCenter(toCenterId, lead.assignedToId)
  } else {
    return { ok: false, error: 'Chọn sale mới hoặc cơ sở mới để chuyển' }
  }

  const { actorId, actorName } = getAuditActor(session)
  const [toSale, fromCenter, toCenter] = await Promise.all([
    toSaleId ? db.user.findUnique({ where: { id: toSaleId }, select: { name: true } }) : null,
    lead.centerId ? db.center.findUnique({ where: { id: lead.centerId }, select: { name: true } }) : null,
    toCenterId ? db.center.findUnique({ where: { id: toCenterId }, select: { name: true } }) : null,
  ])

  await db.$transaction(async (tx) => {
    await tx.lead.update({
      where: { id: lead.id },
      data: {
        centerId: toCenterId,
        assignedToId: toSaleId,
        handoverNote: d.handoverNote,
        ...(lead.status === 'NEW' && toSaleId ? { status: 'ASSIGNED' as const } : {}),
      },
    })

    await tx.leadActivity.create({
      data: {
        leadId: lead.id,
        actorId,
        actorName,
        type: 'HANDOVER',
        content: d.handoverNote,
        metadata: {
          fromSaleId: lead.assignedToId,
          toSaleId,
          fromCenterId: lead.centerId,
          toCenterId,
          reason: d.reason || null,
        },
      },
    })

    await tx.leadTransfer.create({
      data: {
        leadId: lead.id,
        fromCenterId: lead.centerId,
        toCenterId,
        fromSaleId: lead.assignedToId,
        toSaleId,
        note: d.handoverNote,
        reason: d.reason || null,
        transferredById: actorId,
        transferredByName: actorName,
      },
    })

    await logLeadAudit({
      leadId: lead.id,
      action: 'ASSIGN',
      actorId,
      actorName,
      oldValues: { assignedToId: lead.assignedToId, centerId: lead.centerId },
      newValues: { assignedToId: toSaleId, centerId: toCenterId },
      changedFields: ['assignedToId', 'centerId'],
      tx,
    })
  })

  void toSale
  void fromCenter
  void toCenter
  revalidatePath('/leads')
  revalidatePath(`/leads/${lead.id}`)
  return { ok: true }
}
