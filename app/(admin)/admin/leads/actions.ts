'use server'

import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { hasRole } from '@/lib/auth/permissions'
import { canViewLeadPii } from '@/lib/auth/check-permission'
import { checkPermission } from '@/lib/auth/check-permission'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { phoneVn } from '@/lib/validators/phone'
import type { Prisma } from '@prisma/client'
import { logLeadAudit, getAuditActor } from '@/lib/audit/log'
import { resolveActor } from '@/lib/auth/actor'
import { passesScope, scopedDb } from '@/lib/db-scope'
import { getLeadPaymentSummary } from '@/lib/payments/summary'
import { autoAssignLead, reassignOpenLeads } from '@/lib/lead/assign'
import { validateTransferTarget } from '@/lib/crm/transfer-validate'
import { autoAssignNewLead, manualAssignLead, reassignForCenter } from '@/lib/lead/auto-assign'
import { assignmentWrite } from '@/lib/lead/assignment'
import { centerIdForOrgUnit } from '@/lib/org/org-service'
import { rejectHeadOffice } from '@/lib/enrollment-flow'
import { LEAD_STATUS_LABEL, canTransitionLeadStatus } from '@/lib/leads/status'
import { leadChildSchema } from '@/lib/validators/lead'
import { syncLeadChildNameToStudents } from '@/lib/students/sync-name'

const statusSchema = z.enum([
  'NEW',
  'ASSIGNED',
  'CONTACTED',
  'NO_ANSWER',
  'CONSULTING',
  'TRIAL_SCHEDULED',
  'TRIAL_ATTENDED',
  'TRIAL_IN_PROGRESS',
  'AWAITING_DECISION',
  'REGISTERED',
  'ENROLLED',
  'NURTURING',
  'LOST',
  'DUPLICATE',
  'DEMO_SCHEDULED',
])

// ─── #11 T1 (câu 10 BGĐ, Kiệt ký spec 10/07) — lead "dùng chung" ────────────
/**
 * Q2: lead chia sẻ → người khác chỉ XEM + GHI CHÚ (addLeadActivity). Mọi mutator
 * (status/fields/note/loại đơn/task) đòi OWNER (assignee) hoặc actor view-all
 * (QL/Admin). KHÔNG export ('use server': export async = public endpoint).
 * Cũng vá luôn lỗ pre-existing: Sale A gọi action với leadId của Sale B cùng cơ sở.
 */
async function actorMayMutateLead(
  sessionUserId: string,
  assignedToId: string | null,
): Promise<boolean> {
  if (assignedToId === sessionUserId) return true
  return checkPermission('leads:view-all')
}

const MUTATE_DENIED =
  'Chỉ người phụ trách lead được sửa — lead dùng chung chỉ xem + ghi chú'

/**
 * Q1/Q3: bật/tắt "dùng chung" — chỉ OWNER (assignee) hoặc QL cơ sở (leads:assign).
 * Q4: phạm vi chia sẻ = trong cơ sở (scopedDb cách ly, không nới). Ghi audit.
 */
export async function toggleLeadShareAction(
  leadId: string,
  share: boolean,
): Promise<{ ok: boolean; error?: string }> {
  const session = await auth()
  if (!session?.user) return { ok: false, error: 'Chưa đăng nhập' }
  if (!(await checkPermission('leads:edit'))) return { ok: false, error: 'Không có quyền' }

  const before = await db.lead.findUnique({
    where: { id: leadId },
    select: { assignedToId: true, centerId: true, isSharedWithTeam: true },
  })
  const actor = await resolveActor(session.user.id)
  if (!before || !passesScope('Lead', before, actor)) {
    return { ok: false, error: 'Lead không tồn tại' }
  }

  const isOwner = before.assignedToId === session.user.id
  // QL cơ sở: leads:assign (điều phối lead) — có ở cả v1 matrix lẫn v2 seed (không lệch shadow).
  if (!isOwner && !(await checkPermission('leads:assign', { centerId: before.centerId }))) {
    return { ok: false, error: 'Chỉ người phụ trách hoặc Quản lý cơ sở được bật/tắt dùng chung' }
  }
  if (before.isSharedWithTeam === share) return { ok: true }

  const { actorId, actorName } = getAuditActor(session)
  await db.$transaction(async (tx) => {
    await tx.lead.update({
      where: { id: leadId },
      data: {
        isSharedWithTeam: share,
        sharedAt: share ? new Date() : null,
        sharedById: share ? session.user.id : null,
      },
    })
    await logLeadAudit({
      leadId,
      action: 'UPDATE',
      actorId,
      actorName,
      oldValues: { isSharedWithTeam: before.isSharedWithTeam },
      newValues: { isSharedWithTeam: share },
      changedFields: ['isSharedWithTeam'],
      tx,
    })
    await tx.leadActivity.create({
      data: {
        leadId,
        actorId,
        actorName,
        type: 'NOTE',
        content: share
          ? 'Bật "dùng chung" — CSKH cùng cơ sở xem được lead này'
          : 'Tắt "dùng chung"',
      },
    })
  })

  revalidatePath(`/leads/${leadId}`)
  revalidatePath('/leads')
  return { ok: true }
}

export async function updateLeadStatus(
  leadId: string,
  rawStatus: string,
): Promise<{ ok: boolean; error?: string }> {
  const session = await auth()
  if (!session?.user) return { ok: false, error: 'Chua dang nhap' }
  if (!(await checkPermission('leads:edit'))) return { ok: false, error: 'Khong co quyen' }

  const parsed = statusSchema.safeParse(rawStatus)
  if (!parsed.success) return { ok: false, error: 'Trang thai khong hop le' }

  const before = await db.lead.findUnique({
    where: { id: leadId },
    select: { status: true, centerId: true, assignedToId: true },
  })
  const actor = await resolveActor(session.user.id)
  if (!before || !passesScope('Lead', before, actor)) {
    return { ok: false, error: 'Lead khong ton tai' }
  }
  if (!(await actorMayMutateLead(session.user.id, before.assignedToId))) {
    return { ok: false, error: MUTATE_DENIED }
  }

  // R7-01 — chỉ cho phép chuyển trạng thái hợp lệ theo pipeline.
  // S3 — đọc khoản Sale ghi nhận THỰC qua getLeadPaymentSummary (cùng reader với card +
  //      guard convert) → AWAITING_DECISION→REGISTERED mở khoá khi đã có Payment(RECORDED).
  //      (Bình thường lead tự lên REGISTERED khi ghi Payment; đây là đường chuyển TAY.)
  const summary = await getLeadPaymentSummary(scopedDb(actor), leadId)
  const hasRecordedPayment = summary.recordedCount > 0
  const transition = canTransitionLeadStatus(before.status, parsed.data, {
    hasRecordedPayment,
  })
  if (!transition.ok) {
    return { ok: false, error: transition.reason }
  }

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

// ─── LD1/G2 — Loại đơn dự kiến (OrderKind) + sản phẩm/khoá dự kiến trên lead detail ──

const expectedOrderSchema = z.object({
  kind: z.enum(['COURSE', 'PRODUCT']),
  // null/undefined = chỉ chọn loại đơn, chưa chọn item cụ thể (hoặc reset khi đổi loại).
  itemId: z.string().min(1).nullish(),
})

/**
 * Đặt loại đơn dự kiến (Khoá học / Sản phẩm) + item cụ thể (khoá/sản phẩm) cho lead.
 * - kind=COURSE → expectedCourseId = item (course teachable+active), expectedProductId=null.
 * - kind=PRODUCT → expectedProductId = item (product ACTIVE KIT_ROBOT/SENSOR), expectedCourseId=null.
 * - itemId rỗng (đổi loại đơn) → xoá cả 2 expected id.
 * Dùng để gợi ý nguồn item khi tạo đơn. Giữ tên cũ để tương thích component.
 */
export async function updateLeadOrderKind(
  leadId: string,
  kind: string,
  itemId?: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const session = await auth()
  if (!session?.user) return { ok: false, error: 'Chưa đăng nhập' }
  if (!(await checkPermission('leads:edit'))) return { ok: false, error: 'Không có quyền' }

  const parsed = expectedOrderSchema.safeParse({ kind, itemId: itemId ?? null })
  if (!parsed.success) return { ok: false, error: 'Dữ liệu loại đơn không hợp lệ' }
  const { kind: k, itemId: id } = parsed.data

  const before = await db.lead.findUnique({
    where: { id: leadId },
    select: { centerId: true, assignedToId: true },
  })
  const actor = await resolveActor(session.user.id)
  if (!before || !passesScope('Lead', before, actor)) {
    return { ok: false, error: 'Lead không tồn tại' }
  }
  if (!(await actorMayMutateLead(session.user.id, before.assignedToId))) {
    return { ok: false, error: MUTATE_DENIED }
  }

  // Validate item khớp loại đơn (nếu có chọn item).
  let expectedCourseId: string | null = null
  let expectedProductId: string | null = null
  if (id) {
    if (k === 'COURSE') {
      const c = await db.course.findFirst({
        where: { id, isActive: true, isTeachable: true },
        select: { id: true },
      })
      if (!c) return { ok: false, error: 'Khoá học không hợp lệ' }
      expectedCourseId = id
    } else {
      const p = await db.product.findFirst({
        where: { id, status: 'ACTIVE', category: { in: ['KIT_ROBOT', 'SENSOR'] } },
        select: { id: true },
      })
      if (!p) return { ok: false, error: 'Sản phẩm không hợp lệ' }
      expectedProductId = id
    }
  }

  await db.lead.update({
    where: { id: leadId },
    data: { orderKind: k, expectedCourseId, expectedProductId },
  })

  revalidatePath(`/leads/${leadId}`)
  return { ok: true }
}

// ─── Phase T1.2 — Activity + Task ────────────────────────────────────────────

const activityTypeSchema = z.enum(['CALL', 'MESSAGE', 'NOTE', 'EMAIL'])

export async function addLeadActivity(input: {
  leadId: string
  type: string
  content: string
  // LD4 — metadata JSON tuỳ theo loại (CALL/MESSAGE/EMAIL/NOTE). Optional →
  // backward compatible: caller cũ chỉ truyền { leadId, type, content } vẫn chạy.
  metadata?: Prisma.InputJsonValue | null
}): Promise<{ ok: boolean; error?: string }> {
  const session = await auth()
  if (!session?.user) return { ok: false, error: 'Chưa đăng nhập' }
  if (!(await checkPermission('leads:edit'))) return { ok: false, error: 'Không có quyền' }

  const parsedType = activityTypeSchema.safeParse(input.type)
  if (!parsedType.success) return { ok: false, error: 'Loại hoạt động không hợp lệ' }
  const content = input.content?.trim()
  if (!content) return { ok: false, error: 'Vui lòng nhập nội dung' }

  const lead = await db.lead.findUnique({
    where: { id: input.leadId },
    select: { id: true, centerId: true },
  })
  const actor = await resolveActor(session.user.id)
  if (!lead || !passesScope('Lead', lead, actor)) {
    return { ok: false, error: 'Lead không tồn tại' }
  }

  const { actorId, actorName } = getAuditActor(session)
  // AC4 — ghi hoạt động + reset đồng hồ SLA idle (lastActivityAt) trong 1 tx.
  await db.$transaction(async (tx) => {
    await tx.leadActivity.create({
      data: {
        leadId: input.leadId,
        actorId,
        actorName,
        type: parsedType.data,
        content,
        // Chỉ set khi caller có truyền metadata → tránh ghi đè null không cần.
        ...(input.metadata != null ? { metadata: input.metadata } : {}),
      },
    })
    await tx.lead.update({
      where: { id: input.leadId },
      data: { lastActivityAt: new Date() },
    })
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
  if (!(await checkPermission('leads:edit'))) return { ok: false, error: 'Không có quyền' }

  const title = input.title?.trim()
  if (!title) return { ok: false, error: 'Vui lòng nhập tiêu đề việc' }
  const due = new Date(input.dueAt)
  if (Number.isNaN(due.getTime())) return { ok: false, error: 'Hạn không hợp lệ' }

  const lead = await db.lead.findUnique({
    where: { id: input.leadId },
    select: { id: true, assignedToId: true, centerId: true },
  })
  const actor = await resolveActor(session.user.id)
  if (!lead || !passesScope('Lead', lead, actor)) {
    return { ok: false, error: 'Lead không tồn tại' }
  }
  if (!(await actorMayMutateLead(session.user.id, lead.assignedToId))) {
    return { ok: false, error: MUTATE_DENIED }
  }

  const { actorId, actorName } = getAuditActor(session)
  // AC4 — tạo việc cũng là hoạt động → reset đồng hồ SLA idle trong 1 tx.
  await db.$transaction(async (tx) => {
    await tx.leadTask.create({
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
    await tx.lead.update({ where: { id: input.leadId }, data: { lastActivityAt: new Date() } })
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
  if (!(await checkPermission('leads:edit'))) return { ok: false, error: 'Không có quyền' }

  const task = await db.leadTask.findUnique({
    where: { id: taskId },
    select: { leadId: true, lead: { select: { centerId: true, assignedToId: true } } },
  })
  const actor = await resolveActor(session.user.id)
  if (!task || !passesScope('Lead', { centerId: task.lead?.centerId ?? null }, actor)) {
    return { ok: false, error: 'Việc không tồn tại' }
  }
  if (!(await actorMayMutateLead(session.user.id, task.lead?.assignedToId ?? null))) {
    return { ok: false, error: MUTATE_DENIED }
  }

  await db.$transaction(async (tx) => {
    await tx.leadTask.update({
      where: { id: taskId },
      data: done
        ? { status: 'DONE', completedAt: new Date() }
        : { status: 'OPEN', completedAt: null },
    })
    // AC4 — hoàn tất việc là hoạt động → reset đồng hồ SLA idle.
    await tx.lead.update({ where: { id: task.leadId }, data: { lastActivityAt: new Date() } })
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
  if (!(await checkPermission('leads:edit'))) return { ok: false, error: 'Khong co quyen' }

  const before = await db.lead.findUnique({
    where: { id: leadId },
    select: { note: true, centerId: true, assignedToId: true },
  })
  const actor = await resolveActor(session.user.id)
  if (!before || !passesScope('Lead', before, actor)) {
    return { ok: false, error: 'Lead khong ton tai' }
  }
  if (!(await actorMayMutateLead(session.user.id, before.assignedToId))) {
    return { ok: false, error: MUTATE_DENIED }
  }

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
  if (!(await checkPermission('leads:delete'))) {
    return { ok: false, error: 'Khong co quyen xoa lead' }
  }

  const before = await db.lead.findUnique({
    where: { id: leadId, deletedAt: null },
    select: { parentName: true, phone: true, status: true, centerId: true },
  })
  const actor = await resolveActor(session.user.id)
  if (!before || !passesScope('Lead', before, actor)) {
    return { ok: false, error: 'Lead khong ton tai hoac da bi xoa' }
  }

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
  if (!(await checkPermission('leads:assign'))) return { ok: false, error: 'Không có quyền' }

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
  if (!(await checkPermission('leads:assign'))) return { ok: false, error: 'Không có quyền' }

  const { actorId, actorName } = getAuditActor(session)
  const res = await reassignOpenLeads(userId, { actorId, actorName })
  if (!res.ok) return { ok: false, error: res.error }

  revalidatePath('/leads')
  revalidatePath('/dashboard')
  return { ok: true, reassigned: res.reassigned }
}

// ─── Module CRM & Lead PHẦN 1 — CRUD lead thủ công ───────────────────────────

const manualLeadSchema = z.object({
  parentName: z.string().trim().min(2, 'Tên phụ huynh tối thiểu 2 ký tự').max(100),
  phone: phoneVn,
  email: z.string().trim().email('Email không hợp lệ').optional().or(z.literal('')),
  childName: z.string().trim().max(100).optional().or(z.literal('')),
  childAge: z.coerce.number().int().min(3).max(18).optional().nullable(),
  centerId: z.string().trim().optional().or(z.literal('')),
  orgUnitId: z.string().trim().optional().or(z.literal('')), // PR-C: đơn vị (OrgUnit) — nguồn chính; centerId suy ra (HO→null)
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
  if (!(await checkPermission('leads:create'))) return { ok: false, error: 'Không có quyền' }

  const parsed = manualLeadSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Dữ liệu không hợp lệ' }
  }
  const d = parsed.data

  // P2-2: trùng SĐT → báo lỗi RÕ (không fail thầm lặng). Kèm trạng thái + người
  // phụ trách nếu nhân viên có quyền xem (view-all hoặc cùng cơ sở).
  const dup = await db.lead.findFirst({
    where: { phone: d.phone, deletedAt: null },
    select: {
      id: true,
      status: true,
      centerId: true,
      assignedTo: { select: { name: true } },
    },
  })
  if (dup) {
    // #11 T2 — chi tiết trùng (trạng thái + tên sale phụ trách) là dữ liệu tư vấn/PII:
    // chỉ lộ khi VỪA trong scope (view-all theo cơ sở HOẶC cùng cơ sở) VỪA có quyền
    // leads:view-pii. Non-holder (vd MARKETING) chỉ nhận thông báo chung, không chi tiết.
    const canSeeDetail =
      (await canViewLeadPii()) &&
      ((await checkPermission('leads:view-all', { centerId: dup.centerId })) ||
        (!!dup.centerId && dup.centerId === session.user.centerId))
    if (canSeeDetail) {
      const who = dup.assignedTo?.name ? `, phụ trách: ${dup.assignedTo.name}` : ''
      return {
        ok: false,
        error: `SĐT đã tồn tại trong CRM (trạng thái: ${LEAD_STATUS_LABEL[dup.status] ?? dup.status}${who}). Mở lead hiện có thay vì tạo mới.`,
      }
    }
    return {
      ok: false,
      error: 'SĐT đã tồn tại trong CRM. Vui lòng báo quản lý cơ sở kiểm tra.',
    }
  }

  const { actorId, actorName } = getAuditActor(session)

  // PR-C: orgUnitId là nguồn chính; centerId suy ra (HO→null) để dual-write/scopedDb cũ.
  const orgUnitId = d.orgUnitId || null
  const centerId = await centerIdForOrgUnit(orgUnitId)

  // Hội sở không nhận lead — chặn ngay lúc nhập, không để tới lúc chốt mới báo.
  const hoErr = await rejectHeadOffice('lead', { orgUnitId, centerId })
  if (hoErr) return { ok: false, error: hoErr }

  const lead = await db.lead.create({
    data: {
      parentName: d.parentName,
      phone: d.phone,
      email: d.email || null,
      childName: d.childName || null,
      childAge: d.childAge ?? null,
      centerId,
      orgUnitId,
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

  // P2-1: ghi nhật ký kiểm toán tạo lead.
  await logLeadAudit({
    leadId: lead.id,
    action: 'CREATE',
    actorId,
    actorName,
    newValues: {
      parentName: d.parentName,
      phone: d.phone,
      childName: d.childName ?? null,
      centerId,
      orgUnitId,
      source: d.source || 'Nhập tay',
    },
  }).catch(() => {})

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
  if (!(await checkPermission('leads:edit'))) return { ok: false, error: 'Không có quyền' }

  const parsed = updateLeadFieldsSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Dữ liệu không hợp lệ' }
  }
  const d = parsed.data

  const before = await db.lead.findUnique({
    where: { id: leadId },
    select: {
      id: true,
      parentName: true,
      phone: true,
      email: true,
      childName: true,
      childAge: true,
      centerId: true,
      orgUnitId: true,
      courseId: true,
      source: true,
      note: true,
      assignedToId: true,
    },
  })
  // Cách ly cơ sở (chống IDOR ghi): Lead phải thuộc tầm nhìn cơ sở actor —
  // đồng bộ với updateLeadStatus/updateLeadNote/deleteLead.
  const actor = await resolveActor(session.user.id)
  if (!before || !passesScope('Lead', before, actor)) {
    return { ok: false, error: 'Lead không tồn tại' }
  }
  if (!(await actorMayMutateLead(session.user.id, before.assignedToId))) {
    return { ok: false, error: MUTATE_DENIED }
  }

  // Đổi SĐT → kiểm tra trùng.
  if (d.phone && d.phone !== before.phone) {
    const dup = await db.lead.findFirst({
      where: { phone: d.phone, deletedAt: null, id: { not: leadId } },
      select: { id: true },
    })
    if (dup) return { ok: false, error: 'SĐT đã tồn tại ở lead khác' }
  }

  // PR-C dual-write: đổi đơn vị → orgUnitId là nguồn chính, suy centerId (HO→null).
  let centerId: string | null | undefined
  if (d.orgUnitId !== undefined) {
    centerId = await centerIdForOrgUnit(d.orgUnitId || null)
    const hoErr = await rejectHeadOffice('lead', { orgUnitId: d.orgUnitId || null, centerId })
    if (hoErr) return { ok: false, error: hoErr }
  }

  const updateData = {
    ...(d.parentName !== undefined ? { parentName: d.parentName } : {}),
    ...(d.phone !== undefined ? { phone: d.phone } : {}),
    ...(d.email !== undefined ? { email: d.email || null } : {}),
    ...(d.childName !== undefined ? { childName: d.childName || null } : {}),
    ...(d.childAge !== undefined ? { childAge: d.childAge ?? null } : {}),
    ...(d.orgUnitId !== undefined ? { orgUnitId: d.orgUnitId || null, centerId } : {}),
    ...(d.courseId !== undefined ? { courseId: d.courseId || null } : {}),
    ...(d.source !== undefined ? { source: d.source || null } : {}),
    ...(d.note !== undefined ? { note: d.note || null } : {}),
  }
  await db.lead.update({ where: { id: leadId }, data: updateData })

  // P2-1: ghi nhật ký kiểm toán — chỉ field thực sự đổi.
  const changedFields = (Object.keys(updateData) as (keyof typeof updateData)[]).filter(
    (k) => (before as Record<string, unknown>)[k] !== (updateData as Record<string, unknown>)[k],
  )
  if (changedFields.length > 0) {
    const { actorId, actorName } = getAuditActor(session)
    const pick = (obj: Record<string, unknown>) =>
      Object.fromEntries(changedFields.map((k) => [k, obj[k]]))
    await logLeadAudit({
      leadId,
      action: 'UPDATE',
      actorId,
      actorName,
      oldValues: pick(before as Record<string, unknown>),
      newValues: pick(updateData as Record<string, unknown>),
      changedFields: changedFields as string[],
    }).catch(() => {})
  }

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
  if (!(await checkPermission('leads:assign'))) return { ok: false, error: 'Không có quyền' }

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
  if (!(await checkPermission('leads:assign'))) return { ok: false, error: 'Không có quyền' }

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
  if (!(await checkPermission('leads:assign', { centerId }))) return { ok: false, error: 'Không có quyền' }

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
): Promise<{ ok: boolean; error?: string; code?: string }> {
  const session = await auth()
  if (!session?.user) return { ok: false, error: 'Chưa đăng nhập' }
  if (!(await checkPermission('leads:edit'))) return { ok: false, error: 'Không có quyền' }

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

  // Cách ly cơ sở (chống IDOR ghi): Lead nguồn phải thuộc tầm nhìn cơ sở actor —
  // đồng bộ với updateLeadFields. Guard assignedToId bên dưới CHƯA đủ (leads:view-all
  // bỏ qua guard → CENTER_MANAGER CS1 có thể chuyển lead CS2). Chuyển SANG cơ sở khác
  // (toCenterId) vẫn cho phép — đó là nghiệp vụ bàn giao liên cơ sở.
  const actor = await resolveActor(session.user.id)
  if (!passesScope('Lead', lead, actor)) {
    return { ok: false, error: 'Lead không tồn tại' }
  }

  // SALE (chỉ view-own) chỉ tự chuyển lead của mình.
  if (!(await checkPermission('leads:view-all', { centerId: lead.centerId })) && lead.assignedToId !== session.user.id) {
    return { ok: false, error: 'Chỉ chuyển được lead của bạn' }
  }

  const toCenterId = d.toCenterId || lead.centerId || null
  const centerChanged = !!toCenterId && toCenterId !== lead.centerId

  // Không bàn giao lead sang Hội sở (cùng luật với lúc tạo/sửa).
  const hoErrTransfer = await rejectHeadOffice('lead', { centerId: toCenterId })
  if (hoErrTransfer) return { ok: false, error: hoErrTransfer }

  // FL2-03 — chặn bàn giao "rỗng": cơ sở/sale đích trùng nguồn → báo lỗi rõ (code EN,
  // message VI). Validator thuần (Vitest) — xem lib/crm/transfer-validate.ts.
  const targetCheck = validateTransferTarget({
    fromCenterId: lead.centerId,
    fromSaleId: lead.assignedToId,
    toCenterId,
    toSaleId: d.toSaleId || null,
  })
  if (!targetCheck.ok) {
    return { ok: false, code: targetCheck.error.code, error: targetCheck.error.message }
  }

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
        // Đợt A — kèm mốc phân công. Chuyển lead sang người khác thì người nhận
        // phải có cửa sổ SLA riêng, không thừa hưởng đồng hồ của người trước.
        ...assignmentWrite(toSaleId),
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

// ─── R7-01 — LeadChild (1 Lead có N con) ─────────────────────────────────────

/** Map dữ liệu đã validate → payload ghi LeadChild (chuẩn hoá rỗng → null). */
function leadChildData(parsed: unknown) {
  const d = parsed as {
    fullName: string
    dob?: string | Date | null
    ageYears?: number | null
    gender?: string | null
    schoolName?: string | null
    gradeLevel?: string | null
    interestedCourseId?: string | null
    interestedCenterId?: string | null
    note?: string | null
  }
  return {
    fullName: d.fullName,
    dob: d.dob ? new Date(d.dob) : null,
    ageYears: d.ageYears ?? null,
    gender: d.gender || null,
    schoolName: d.schoolName || null,
    gradeLevel: d.gradeLevel || null,
    interestedCourseId: d.interestedCourseId || null,
    interestedCenterId: d.interestedCenterId || null,
    note: d.note || null,
  }
}

/** Thêm 1 con vào lead. `input` gồm `leadId` + các field con (leadChildSchema). */
export async function addLeadChild(
  input: unknown,
): Promise<{ ok: boolean; error?: string }> {
  const session = await auth()
  if (!session?.user) return { ok: false, error: 'Chưa đăng nhập' }
  if (!(await checkPermission('leads:edit'))) return { ok: false, error: 'Không có quyền' }

  const leadId = (input as { leadId?: unknown })?.leadId
  if (typeof leadId !== 'string' || !leadId) {
    return { ok: false, error: 'Thiếu lead' }
  }

  // LeadChild không có centerId riêng → scope theo lead cha.
  const lead = await db.lead.findUnique({
    where: { id: leadId },
    select: { id: true, centerId: true },
  })
  const actor = await resolveActor(session.user.id)
  if (!lead || !passesScope('Lead', lead, actor)) {
    return { ok: false, error: 'Lead không tồn tại' }
  }

  const parsed = leadChildSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Dữ liệu không hợp lệ' }
  }
  const data = leadChildData(parsed.data)

  const { actorId, actorName } = getAuditActor(session)
  const child = await db.leadChild.create({
    data: { leadId, ...data },
    select: { id: true, fullName: true },
  })

  await logLeadAudit({
    leadId,
    action: 'UPDATE',
    actorId,
    actorName,
    newValues: { childAdded: child.fullName, leadChildId: child.id },
    changedFields: ['children'],
  }).catch(() => {})

  revalidatePath(`/leads/${leadId}`)
  revalidatePath('/leads')
  return { ok: true }
}

/** Sửa thông tin 1 con. Scope theo lead cha của con. */
export async function updateLeadChild(
  childId: string,
  input: unknown,
): Promise<{ ok: boolean; error?: string }> {
  const session = await auth()
  if (!session?.user) return { ok: false, error: 'Chưa đăng nhập' }
  if (!(await checkPermission('leads:edit'))) return { ok: false, error: 'Không có quyền' }

  const child = await db.leadChild.findUnique({
    where: { id: childId },
    select: { id: true, leadId: true, fullName: true, lead: { select: { centerId: true } } },
  })
  const actor = await resolveActor(session.user.id)
  if (!child || !passesScope('Lead', { centerId: child.lead?.centerId ?? null }, actor)) {
    return { ok: false, error: 'Không tìm thấy con của lead' }
  }

  const parsed = leadChildSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Dữ liệu không hợp lệ' }
  }
  const data = leadChildData(parsed.data)

  const { actorId, actorName } = getAuditActor(session)
  // 08/08 — đổi tên con Ở MÀN LEAD cũng phải dội sang hồ sơ học viên đã convert (và
  // các bản sao còn lại), cùng một transaction — đối xứng với chiều updateStudent.
  // Sửa một nơi mà nơi kia giữ tên cũ thì lần lưu sau sẽ ghi đè ngược, hai hồ sơ
  // giằng co nhau vô hạn.
  let syncedStudentIds: string[] = []
  await db.$transaction(async (txRaw) => {
    const tx = txRaw as unknown as Prisma.TransactionClient
    await tx.leadChild.update({ where: { id: childId }, data })

    // KHÔNG .catch() nuốt lỗi ở đây nữa: query hỏng giữa transaction là tx đã toang,
    // nuốt đi chỉ đổi được thông báo lỗi khó hiểu hơn ở query kế tiếp.
    await logLeadAudit({
      leadId: child.leadId,
      action: 'UPDATE',
      actorId,
      actorName,
      oldValues: { childUpdated: child.fullName, leadChildId: childId },
      newValues: { fullName: data.fullName },
      changedFields: ['children'],
      tx,
    })

    if (child.fullName !== data.fullName) {
      const res = await syncLeadChildNameToStudents({
        tx,
        leadChildId: childId,
        oldName: child.fullName,
        newName: data.fullName,
        actor: { id: actorId, name: actorName },
      })
      syncedStudentIds = res.studentIds
    }
  })

  revalidatePath(`/leads/${child.leadId}`)
  revalidatePath('/leads')
  if (syncedStudentIds.length > 0) {
    revalidatePath('/students')
    for (const sid of syncedStudentIds) revalidatePath(`/students/${sid}/edit`)
  }
  return { ok: true }
}

/** Xoá 1 con khỏi lead. Scope theo lead cha của con. */
export async function deleteLeadChild(
  childId: string,
): Promise<{ ok: boolean; error?: string }> {
  const session = await auth()
  if (!session?.user) return { ok: false, error: 'Chưa đăng nhập' }
  if (!(await checkPermission('leads:edit'))) return { ok: false, error: 'Không có quyền' }

  const child = await db.leadChild.findUnique({
    where: { id: childId },
    select: { id: true, leadId: true, fullName: true, lead: { select: { centerId: true } } },
  })
  const actor = await resolveActor(session.user.id)
  if (!child || !passesScope('Lead', { centerId: child.lead?.centerId ?? null }, actor)) {
    return { ok: false, error: 'Không tìm thấy con của lead' }
  }

  // R7-02 edge: con đang ở lớp trải nghiệm ACTIVE → CHẶN xoá (FK Cascade sẽ xoá luôn
  // TrialEnrollment/attendance — mất dữ liệu). Yêu cầu rút khỏi lớp trước.
  const activeTrials = await db.trialEnrollment.count({
    where: { leadChildId: childId, status: 'ACTIVE' },
  })
  if (activeTrials > 0) {
    return { ok: false, error: 'Học viên đang ở lớp trải nghiệm — rút khỏi lớp trước khi xoá' }
  }

  const { actorId, actorName } = getAuditActor(session)
  await db.leadChild.delete({ where: { id: childId } })

  await logLeadAudit({
    leadId: child.leadId,
    action: 'UPDATE',
    actorId,
    actorName,
    oldValues: { childRemoved: child.fullName, leadChildId: childId },
    changedFields: ['children'],
  }).catch(() => {})

  revalidatePath(`/leads/${child.leadId}`)
  revalidatePath('/leads')
  return { ok: true }
}
