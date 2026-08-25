'use server'

import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { hasRole } from '@/lib/auth/permissions'
import { canViewLeadPii } from '@/lib/auth/check-permission'
import { checkPermission } from '@/lib/auth/check-permission'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { phoneVn } from '@/lib/validators/phone'
import { phoneVariants } from '@/lib/phone'
import type { Prisma } from '@prisma/client'
import { logLeadAudit, getAuditActor } from '@/lib/audit/log'
import { resolveActor } from '@/lib/auth/actor'
import { passesScope, scopedDb } from '@/lib/db-scope'
import { getLeadPaymentSummary } from '@/lib/payments/summary'
import { autoAssignLead, reassignOpenLeads } from '@/lib/lead/assign'
import { leadSharingEnabled } from '@/lib/lead/sharing'
import { validateTransferTarget } from '@/lib/crm/transfer-validate'
import { autoAssignNewLead, manualAssignLead, reassignForCenter } from '@/lib/lead/auto-assign'
import { assignmentWrite } from '@/lib/lead/assignment'
import { centerIdForOrgUnit } from '@/lib/org/org-service'
import { rejectHeadOffice } from '@/lib/enrollment-flow'
import { normalizeFacebookUrl } from '@/lib/lead/intake/normalize'
import { mergeLeadNote } from '@/lib/lead/note-view'
import { LEAD_STATUS_LABEL, canTransitionLeadStatus } from '@/lib/leads/status'
import { leadChildSchema } from '@/lib/validators/lead'
import { syncLeadChildNameToStudents } from '@/lib/students/sync-name'
import {
  getPriorHistoryByPhone,
  summarizePriorHistory,
} from '@/lib/students/prior-history'

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
  // Đợt E (22/08) — chính sách "dùng chung lead" đã TẮT (Q8: lead độc quyền).
  // Chặn ở action, không chỉ ẩn nút: UI cũ còn nằm trong cache trình duyệt và
  // Server Action là một endpoint gọi thẳng được.
  if (!leadSharingEnabled()) {
    return { ok: false, error: 'Tính năng dùng chung lead đã ngừng — mỗi lead do một người phụ trách' }
  }
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

  // 24/08 — ô ghi chú trên UI chỉ chứa phần NGƯỜI GÕ (dòng máy ghi đã bị bốc ra
  // khi hiển thị). Ghi thẳng chuỗi đó xuống là xoá mất dấu vết người nhập + cảnh
  // báo chia lead của phiếu cũ, nên phải ráp lại từ bản đang lưu.
  const newNote = mergeLeadNote(note, before.note)
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
  // Ô "Link Facebook" của biểu mẫu nhập khách (23/08). Đi qua CÙNG bộ chuẩn hoá
  // với đường nhập — nếu không, cùng một người gõ "minh.nguyen.549" ở hai màn sẽ
  // ra hai giá trị khác nhau, và đối khớp lead theo link Facebook sẽ trượt.
  //
  // ⚠️ Chuẩn hoá ở đây KHÔNG phải cho đẹp: nó chặn `javascript:`/`data:` — giá
  // trị này được render thành `<a href>` trong màn admin (xem normalize.ts).
  // Chuỗi không phải link thì thành '' chứ không ném lỗi: người sửa đang gõ dở
  // không đáng bị chặn cả phiếu, và cảnh báo đã có ở đường nhập.
  facebookUrl: z
    .string()
    .trim()
    .max(500)
    .optional()
    .or(z.literal(''))
    .transform((v) => (v ? (normalizeFacebookUrl(v).url ?? '') : v)),
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
    // Đợt G — tra theo BIẾN THỂ SĐT. DB chứa song song `0…` (cũ) và `84…`
    // (canonical); so đúng-bằng nên nhập `84905…` khi đã có `0905…` là đẻ hồ sơ
    // thứ hai — và từ Đợt D mỗi hồ sơ thừa còn tiêu một lượt sai trong sổ.
    // `lib/lead/dedup.ts` đã làm đúng từ lâu; hai màn tay này bị bỏ quên.
    where: { phone: { in: phoneVariants(d.phone) }, deletedAt: null },
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
    // 21/08 — hồ sơ cũ nằm ở CƠ SỞ KHÁC: `Lead` ∈ SCOPED_MODELS nên sale ở đây không mở
    // được nó, và câu báo cụt "báo quản lý cơ sở kiểm tra" khiến họ đứng hình. Nói thêm
    // MỘT tầng không-PII: khách đã từng đăng ký / học ở cơ sở nào, khi nào. Không lộ tên
    // phụ huynh, ghi chú tư vấn hay sale phụ trách — muốn xem vẫn phải qua đúng cơ sở.
    const actorForLookup = await resolveActor(session.user.id!)
    const prior = await getPriorHistoryByPhone(actorForLookup, d.phone)
    const summary = summarizePriorHistory(prior)
    return {
      ok: false,
      error:
        'SĐT đã tồn tại trong CRM. Vui lòng báo quản lý cơ sở kiểm tra.' +
        (summary ? ` ${summary}` : ''),
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
      // 25/08 — nửa còn thiếu của bản vá 23/08 ("thêm cho cả hai đường"): đường
      // SỬA đã ghi được ô này, đường TẠO thì chưa. Schema nhận + chuẩn hoá rồi
      // BỎ, nên người gọi gửi link lên vẫn nhận `{ ok: true }` còn giá trị thì
      // bốc hơi — không lỗi, không nhật ký. Với lead Messenger-first (chưa có
      // SĐT) đây là thứ duy nhất nối lead ↔ hội thoại, mất là không dựng lại được.
      facebookUrl: d.facebookUrl || null,
      status: 'NEW',
      // NGƯỜI NHẬP (23/08) — cùng nghĩa với biểu mẫu /nhap-khach-hang. Đường
      // nhập tay này cũng phải ghi, không thì "phiếu tôi nhập" thủng một nửa.
      createdById: session.user.id,
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
      // Đường SỬA đã ghi ô này vào nhật ký; đường TẠO bỏ trống thì lịch sử một
      // lead có link Facebook bắt đầu bằng khoảng trắng — không truy được ai điền.
      facebookUrl: d.facebookUrl || null,
    },
  }).catch(() => {})

  // Auto-chia theo cơ sở → chế độ cơ sở (PHẦN 2).
  await autoAssignNewLead(lead.id, { actorId, actorName }).catch(() => {})

  revalidatePath('/leads')
  return { ok: true, id: lead.id }
}

const updateLeadFieldsSchema = manualLeadSchema.partial()

/**
 * Bộ ô người NHẬP phiếu được sửa — đúng bằng biểu mẫu `/nhap-khach-hang`
 * (chủ dự án chốt 23/08/2026: "chỉ được sửa các trường có ở form nhap-khach-hang,
 * còn các trường khác thì không được sửa, Sale cs được toàn quyền sửa").
 *
 * Danh sách này là ALLOWLIST, không phải blocklist: thêm ô mới vào biểu mẫu mà
 * quên khai ở đây thì người nhập KHÔNG sửa được ô đó — hỏng theo chiều an toàn.
 * Ngược lại (blocklist) thì mỗi cột mới của `Lead` tự động mở toang.
 *
 * `email` / `childAge` / `courseId` KHÔNG có trong biểu mẫu ⇒ không nằm đây.
 */
const INTAKE_EDITABLE_FIELDS = [
  'parentName',
  'phone',
  'childName',
  'source',
  'note',
  'orgUnitId', // ô "Cơ sở phụ huynh chọn" (centerId suy ra từ đây)
  'facebookUrl',
] as const

const INTAKE_FIELD_DENIED =
  'Bạn chỉ sửa được các ô có trong biểu mẫu nhập khách hàng của phiếu do mình nhập.'

/** Sửa thông tin cơ bản của 1 lead. */
export async function updateLeadFields(
  leadId: string,
  input: unknown,
): Promise<{ ok: boolean; error?: string }> {
  const session = await auth()
  if (!session?.user) return { ok: false, error: 'Chưa đăng nhập' }
  // Hai đường vào, KHÔNG cùng quyền hạn:
  //   · `leads:edit` — Sale cơ sở / quản lý: toàn quyền, y như trước.
  //   · `leads:edit-own-intake` — người NHẬP phiếu (Sale Hội sở): chỉ bộ ô của
  //     biểu mẫu, và chỉ trên phiếu mình nhập.
  //
  // ⚠️ Đường thứ hai CỐ Ý không kiểm ở đây mà kiểm sau khi đọc lead: nó mang
  // scope OWN, mà OWN gọi TRẦN (không kèm `createdById`) thì luôn false — kiểm
  // sớm là chặn nhầm đúng người được phép. Bất biến R1 (lib/auth/rbac-scope.test.ts)
  // quét call-site để bắt lại đúng lỗi này.
  const canEditAll = await checkPermission('leads:edit')

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
      facebookUrl: true,
      assignedToId: true,
      createdById: true,
    },
  })
  // Cách ly cơ sở (chống IDOR ghi): Lead phải thuộc tầm nhìn cơ sở actor —
  // đồng bộ với updateLeadStatus/updateLeadNote/deleteLead.
  const actor = await resolveActor(session.user.id)
  if (!before || !passesScope('Lead', before, actor)) {
    return { ok: false, error: 'Lead không tồn tại' }
  }
  if (canEditAll) {
    if (!(await actorMayMutateLead(session.user.id, before.assignedToId))) {
      return { ok: false, error: MUTATE_DENIED }
    }
  } else {
    // Đường HẸP (người nhập). `actorMayMutateLead` không dùng được ở đây: nó cho
    // qua khi là assignee HOẶC có `leads:view-all` — vai này không có cả hai.
    //
    // Kiểm bằng `can()` KÈM TARGET để scope OWN có tác dụng thật, thay vì tự so
    // `createdById` tại chỗ (luật cứng Nền Hệ thống #1: mọi kiểm quyền đi qua
    // `can()`; so tay ở Server Action là thứ lint `no-inline-authz` cấm).
    const mayEditOwn = await checkPermission('leads:edit-own-intake', {
      createdById: before.createdById ?? undefined,
    })
    if (!mayEditOwn) return { ok: false, error: 'Không có quyền' }

    // Bộ ô: ALLOWLIST. Gửi kèm ô ngoài danh sách là TỪ CHỐI CẢ PHIẾU, không
    // lặng lẽ bỏ qua — im lặng thì người sửa tưởng đã lưu, và bên kia thì không.
    const viPham = Object.keys(d).filter(
      (k) => !(INTAKE_EDITABLE_FIELDS as readonly string[]).includes(k),
    )
    if (viPham.length > 0) {
      return { ok: false, error: `${INTAKE_FIELD_DENIED} (${viPham.join(', ')})` }
    }
  }

  // Đổi SĐT → kiểm tra trùng.
  if (d.phone && d.phone !== before.phone) {
    const dup = await db.lead.findFirst({
      // Đợt G — như trên: tra theo biến thể, không so đúng-bằng.
      where: { phone: { in: phoneVariants(d.phone) }, deletedAt: null, id: { not: leadId } },
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
    // 24/08 — xem ghi chú ở updateLeadNote: ráp lại phần máy ghi, đừng đè trắng.
    ...(d.note !== undefined ? { note: mergeLeadNote(d.note, before.note) } : {}),
    // 23/08 — ô "Link Facebook" CÓ trong biểu mẫu nhập khách nhưng action này
    // chưa bao giờ ghi được: sửa xong là mất im lặng. Thêm cho cả hai đường.
    ...(d.facebookUrl !== undefined ? { facebookUrl: d.facebookUrl || null } : {}),
  }
  // P2-1: ghi nhật ký kiểm toán — chỉ field thực sự đổi.
  const changedFields = (Object.keys(updateData) as (keyof typeof updateData)[]).filter(
    (k) => (before as Record<string, unknown>)[k] !== (updateData as Record<string, unknown>)[k],
  )
  const { actorId, actorName } = getAuditActor(session)
  const pick = (obj: Record<string, unknown>) =>
    Object.fromEntries(changedFields.map((k) => [k, obj[k]]))

  // V-6 · G-02 — lượt ghi và VẾT của nó đi CHUNG một giao dịch.
  //
  // Trước 25/08 hai lệnh này rời nhau: `db.lead.update` trần, rồi
  // `logLeadAudit(...).catch(() => {})` ở ngoài. Hỏng theo đúng chiều tệ nhất —
  // ghi vết chết thì bản ghi VẪN lưu và lỗi bị nuốt sạch, tức tên/SĐT khách đổi
  // mà không còn dấu vết nào, và cũng không ai biết là đã mất dấu. Spec G-02 nói
  // ngược lại: 3 ô định danh (Tên PH · SĐT PH · Tên HS) sửa được NHƯNG "bắt buộc
  // ghi audit log" — bắt buộc thì vết hỏng phải kéo cả lượt sửa đổ theo.
  // `updateLeadChild` cùng file đã làm đúng vậy từ 08/08; đây là chỗ bị bỏ sót.
  try {
    await db.$transaction(async (txRaw) => {
      const tx = txRaw as unknown as Prisma.TransactionClient
      await tx.lead.update({ where: { id: leadId }, data: updateData })
      if (changedFields.length > 0) {
        await logLeadAudit({
          leadId,
          action: 'UPDATE',
          actorId,
          actorName,
          oldValues: pick(before as Record<string, unknown>),
          newValues: pick(updateData as Record<string, unknown>),
          changedFields: changedFields as string[],
          tx,
        })
      }
    })
  } catch {
    // Câu chữ cố ý KHÔNG đổ tại nhật ký: lệnh ghi lead cũng nằm trong giao dịch
    // này, hỏng bên nào thì cả hai cùng hoàn tác. Nói sai chỗ hỏng là đẩy người
    // trực đi tìm nhầm hướng.
    return { ok: false, error: 'Không lưu được thay đổi — đã hoàn tác, thử lại' }
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

  // Đợt G — người gán ở cấp Hội sở được gán xuyên cơ sở (điều phối liên cơ sở là
  // nghiệp vụ có thật, xem màn "Chuyển lead liên CS"). Người cấp cơ sở thì không:
  // đó là vế đã thiếu và đã gây sự cố 21/08.
  const assignActor = await resolveActor(session.user.id)
  const { actorId, actorName } = getAuditActor(session)
  const res = await manualAssignLead(leadId, saleId, { actorId, actorName }, {
    actorIsHoLevel: assignActor.isHoLevel,
  })
  if (!res.ok) return res

  revalidatePath('/leads')
  revalidatePath(`/leads/${leadId}`)
  return { ok: true }
}

const ASSIGN_MODES = ['ROUND_ROBIN', 'CLOSE_RATE', 'MANUAL'] as const

/**
 * Đặt chế độ chia lead cho một cơ sở.
 *
 * ⚠️ Đợt G (23/08/2026) — SIẾT CỔNG. Trước đó action này chỉ đòi `leads:assign`
 * trong khi TRANG gác `leads:assign-config` (chốt 03/08: tách riêng màn cấu hình
 * khỏi quyền điều phối lead). Cổng action lỏng hơn cổng trang là lỗ hổng vô hình:
 * màn hình trông như đã khoá mà endpoint thì không — và `leads:assign` thì
 * CENTER_MANAGER có.
 *
 * Cụ thể mất gì: gọi thẳng action là đổi được chế độ của cả cơ sở sang
 * `CLOSE_RATE`, tức thoát khỏi sổ lượt dựng ở Đợt D, lách đúng quyết định Q7
 * ("chia đều số lượt, tuyệt đối không được sai") mà không sinh một dòng quyết
 * định nào ai đọc được sau này.
 *
 * Nhánh CENTER_MANAGER bên dưới GIỮ NGUYÊN dù hiện là nhánh chết (v1 matrix cho
 * `leads:assign-config` chỉ SUPER_ADMIN): nếu sau này chủ dự án cấp quyền đó cho
 * Quản lý cơ sở (plan/14 Q5, CHƯA ký) thì giới hạn "chỉ cơ sở mình" phải sẵn ở
 * đây, chứ không phải nhớ ra lúc đó.
 */
export async function setCenterAssignModeAction(
  centerId: string,
  mode: string,
): Promise<{ ok: boolean; error?: string }> {
  const session = await auth()
  if (!session?.user) return { ok: false, error: 'Chưa đăng nhập' }
  if (!(await checkPermission('leads:assign-config', { centerId }))) {
    return { ok: false, error: 'Không có quyền' }
  }

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

/**
 * Đồng bộ "Khoá quan tâm" của LEAD theo lựa chọn của Sale ở khối CON (24/08/2026).
 *
 * Chủ dự án chốt: khoá quan tâm của một phiếu là khoá mà Sale chọn lúc nhập con —
 * không phải một ô rời để ai gõ gì cũng được, và tuyệt đối không suy từ `source`.
 * `Lead.courseId` vì vậy là BẢN SAO có chủ đích của `LeadChild.interestedCourseId`,
 * để mọi màn đang đọc `lead.course` (chi tiết, bảng, kanban, convert, bulk-convert)
 * đổi theo mà không phải sửa từng nơi.
 *
 * Con mới sửa/mới thêm thắng (sắp theo `updatedAt` giảm dần) — đó là lựa chọn
 * người dùng vừa bấm. Không con nào chọn khoá ⇒ trả về trống, đúng luật "để trống
 * cho tới khi Sale chọn".
 *
 * ⚠️ Gọi hàm này CÓ ĐIỀU KIỆN, đừng gọi vô tư. Biểu mẫu TẠO lead có ô "Khoá
 * quan tâm" ở cấp lead RỒI mới đến khối con, và tạo xong nó gọi `addLeadChild` cho
 * từng con. Nếu con không chọn khoá mà vẫn đồng bộ, ta sẽ XOÁ TRẮNG thứ người
 * dùng vừa chọn cách đó hai giây — mất dữ liệu im lặng. Luật: chỉ đồng bộ khi con
 * THỰC SỰ chọn khoá, hoặc khi đang gỡ đúng cái khoá do chính con đó đặt.
 */
async function syncLeadCourseFromChildren(
  tx: Prisma.TransactionClient,
  leadId: string,
): Promise<void> {
  const kids = await tx.leadChild.findMany({
    where: { leadId },
    select: { interestedCourseId: true },
    orderBy: { updatedAt: 'desc' },
  })
  const picked = kids.find((k) => k.interestedCourseId)?.interestedCourseId ?? null
  await tx.lead.update({ where: { id: leadId }, data: { courseId: picked } })
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
  const child = await db.$transaction(async (txRaw) => {
    const tx = txRaw as unknown as Prisma.TransactionClient
    const created = await tx.leadChild.create({
      data: { leadId, ...data },
      select: { id: true, fullName: true },
    })
    // Cùng transaction với lượt ghi con: nửa vời (có con, khoá của lead chưa đổi)
    // đúng là trạng thái mà người dùng báo lỗi. Con không chọn khoá thì KHÔNG đụng
    // đến khoá của lead (xem cảnh báo ở `syncLeadCourseFromChildren`).
    if (data.interestedCourseId) await syncLeadCourseFromChildren(tx, leadId)
    return created
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
    select: {
      id: true,
      leadId: true,
      fullName: true,
      interestedCourseId: true,
      lead: { select: { centerId: true, courseId: true } },
    },
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
    // Khoá quan tâm: chọn khoá mới thì lead nhận ngay. Gỡ trắng thì chỉ tính lại khi
    // khoá đang hiển thị trên lead ĐÚNG là do con này đặt — nếu không, đó là khoá
    // nhập tay/import của phiếu, không phải của ta để mà xoá.
    const clearingCourseSetByThisChild =
      !data.interestedCourseId &&
      !!child.interestedCourseId &&
      child.lead?.courseId === child.interestedCourseId
    if (data.interestedCourseId || clearingCourseSetByThisChild) {
      await syncLeadCourseFromChildren(tx, child.leadId)
    }

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
    select: {
      id: true,
      leadId: true,
      fullName: true,
      interestedCourseId: true,
      lead: { select: { centerId: true, courseId: true } },
    },
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
  // Khoá quan tâm của lead có phải do CHÍNH đứa sắp xoá đặt không. Chỉ tính lại
  // khi đúng là của nó — lead nhập từ Excel/tay có khoá riêng, xoá một đứa con
  // không liên quan mà cũng xoá luôn khoá của phiếu là mất dữ liệu không ai gọi.
  const courseCameFromThisChild =
    !!child.interestedCourseId && child.lead?.courseId === child.interestedCourseId

  await db.$transaction(async (txRaw) => {
    const tx = txRaw as unknown as Prisma.TransactionClient
    await tx.leadChild.delete({ where: { id: childId } })
    if (courseCameFromThisChild) await syncLeadCourseFromChildren(tx, child.leadId)
  })

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
