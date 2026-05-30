'use server'

import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { can } from '@/lib/auth/permissions'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { logLeadAudit, logStudentAudit, getAuditActor } from '@/lib/audit/log'
import { autoAssignLead, reassignOpenLeads } from '@/lib/lead/assign'
import { genStudentCode } from '@/lib/codegen'

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
})

export async function closeLeadAsEnrolled(
  leadId: string,
  input: unknown,
): Promise<{
  ok: boolean
  studentId?: string
  studentCode?: string | null
  enrollmentId?: string
  parentAccountEmail?: string
  parentTempPasswordIsPhone?: boolean
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
    },
  })
  if (!lead) return { ok: false, error: 'Lead không tồn tại' }
  if (lead.status === 'ENROLLED') {
    return { ok: false, error: 'Lead này đã được chốt (ENROLLED)' }
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

  // C2 — chuẩn bị thông tin tài khoản phụ huynh (validate ngoài transaction).
  let parentEmail: string | null = null
  let parentPassword: string | null = null
  let parentUsedPhonePassword = false
  if (wantParentAccount) {
    parentEmail =
      (parsed.data.parentEmail?.trim() || lead.email?.trim() || '').toLowerCase() || null
    if (!parentEmail) {
      return { ok: false, error: 'Cần email phụ huynh để cấp tài khoản portal' }
    }
    parentPassword = parsed.data.parentPassword?.trim() || lead.phone
    parentUsedPhonePassword = !parsed.data.parentPassword?.trim()

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

      // Tạo / dùng lại tài khoản phụ huynh trước để gán parentUserId cho student.
      let parentUserId: string | undefined
      if (wantParentAccount && parentEmail && parentPassword) {
        const existing = await tx.user.findUnique({
          where: { email: parentEmail },
          select: { id: true },
        })
        if (existing) {
          parentUserId = existing.id
        } else {
          const hashed = await bcrypt.hash(parentPassword, 10)
          const createdUser = await tx.user.create({
            data: {
              name: lead.parentName,
              email: parentEmail,
              password: hashed,
              role: 'PARENT',
              isActive: true,
              tokenVersion: 0,
            },
            select: { id: true },
          })
          parentUserId = createdUser.id
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

      // Lead → ENROLLED + audit + activity.
      await tx.lead.update({ where: { id: leadId }, data: { status: 'ENROLLED' } })
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
        enrollmentId: enrollment.id,
        parentLinked: !!parentUserId,
      }
    })

    revalidatePath('/leads')
    revalidatePath(`/leads/${leadId}`)
    revalidatePath('/students')
    revalidatePath('/enrollments')
    revalidatePath('/trials')
    revalidatePath('/dashboard')
    revalidatePath('/crm')
    const linked = result.parentLinked && !!parentEmail
    return {
      ok: true,
      studentId: result.studentId,
      studentCode: result.studentCode,
      enrollmentId: result.enrollmentId,
      parentAccountEmail: linked ? (parentEmail as string) : undefined,
      // Nếu mật khẩu mặc định = SĐT, báo sale để dặn phụ huynh đổi sau.
      parentTempPasswordIsPhone: linked ? parentUsedPhonePassword : undefined,
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
        create: { actorId, actorName, type: 'NOTE', content: 'Tạo lead thủ công' },
      },
    },
    select: { id: true },
  })

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
