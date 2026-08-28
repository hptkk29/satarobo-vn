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
import { centerIdsGrantedByAction, roleManagesCenter } from '@/lib/auth/managed-centers'
import { passesScope, scopedDb } from '@/lib/db-scope'
import { getLeadPaymentSummary } from '@/lib/payments/summary'
import { autoAssignLead } from '@/lib/lead/assign'
import { validateTransferTarget } from '@/lib/crm/transfer-validate'
import { autoAssignNewLead, manualAssignLead, reassignForCenter } from '@/lib/lead/auto-assign'
import { applyLeadReassignment, archiveDmOfPreviousSale } from '@/lib/lead/assignment-core'
import type { LeadReassignOutcome } from '@/lib/lead/assignment-core'
import type { VisibleCenterIds } from '@/lib/lead-handover/service'
import { centerIdForOrgUnit } from '@/lib/org/org-service'
import { rejectHeadOffice } from '@/lib/enrollment-flow'
import { LEAD_STATUS_LABEL, canTransitionLeadStatus } from '@/lib/leads/status'
import { leadChildSchema } from '@/lib/validators/lead'
import { syncLeadChildNameToStudents } from '@/lib/students/sync-name'
import { recordLeadActivity } from '@/lib/lead/record-activity'

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

/**
 * Tập cơ sở mà người bấm THỰC SỰ được PHÂN CÔNG LEAD — dùng chung cho cả ba đường ghi
 * (`assignLeadToSaleAction` · `autoAssignLeadAction` · `autoAssignNewLeadAction`).
 *
 * ── VÌ SAO KHÔNG DÙNG `getModelVisibleCenterIds('Lead', actor)` ─────────────────────
 * Đó là dụng cụ của đường ĐỌC, và `lib/auth/managed-centers.ts` gọi thẳng tên nó là "lỗ
 * ngược chiều đang vá" cho cổng GHI — nó NỞ theo hai đường mà cổng ghi không được hưởng
 * (`lib/db-scope.ts`):
 *   1. gom quyền theo TIỀN TỐ model (`leads:`) ⇒ một quyền CHỈ-ĐỌC của VAI KHÁC cũng cộng
 *      vào. Đo được: `roles = [CENTER_MANAGER, MARKETING]` với ô "Đơn vị" = CS1 là cấu
 *      hình HỢP LỆ (L-A5 chỉ cấm CENTER_MANAGER ở HO), mà `lib/auth/legacy-role-map.ts`
 *      LUÔN neo MARKETING → `HO_MARKETING @ HO`; HO_MARKETING mang `leads:view-all` GLOBAL
 *      tại HO ⇒ `centerScope = "ALL"` ⇒ hàm trả "ALL" ⇒ MỌI rào cách ly cơ sở ở tầng lib
 *      tắt sạch. Cùng người đó bị `setCenterAssignModeAction` TỪ CHỐI ở CS2.
 *   2. MỘT dòng `UserPermissionGrant` ALLOW khớp tiền tố `leads:` bật thẳng `hasAll`.
 *
 * Trục đúng là `centerIdsGrantedByAction(actor, 'leads:assign')`: khớp ĐÚNG chuỗi action
 * mà cổng thô (`checkPermission`) vừa kiểm, suy từ chính dòng `UserOrgRole` đẻ ra quyền,
 * và grant per-user chỉ có hiệu lực TRONG tầm nhìn sẵn có chứ không bao giờ thành "ALL".
 * Tập trả về LUÔN LÀ CON của phép đo cũ ⇒ đây là phép SIẾT, không nới cho ai.
 *
 * SUPER_ADMIN → "ALL" y như `can()` v2 thoát sớm (`lib/auth/can.ts`); seed KHÔNG cấp
 * `leads:assign` cho vai này nên thiếu nhánh đó là khoá nhầm chính quản trị tối cao.
 * Cùng khuôn `classCenterWritable` (`app/(admin)/admin/classes/_actions.ts`).
 */
async function leadAssignCenterScope(userId: string): Promise<VisibleCenterIds> {
  const actor = await resolveActor(userId)
  if (actor.isSuperAdmin) return 'ALL'
  return centerIdsGrantedByAction(actor, 'leads:assign')
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
    await recordLeadActivity(tx, {
      leadId,
      actorId,
      actorName,
      type: 'NOTE',
      content: share
        ? 'Bật "dùng chung" — CSKH cùng cơ sở xem được lead này'
        : 'Tắt "dùng chung"',
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
    // STATUS_CHANGE ⇒ recordLeadActivity CỐ Ý không bump `lastActivityAt` (OQ-C4):
    // đổi trạng thái không phải là đã liên hệ khách.
    await recordLeadActivity(tx, {
      leadId,
      actorId,
      actorName,
      type: 'STATUS_CHANGE',
      content: `Chuyển trạng thái: ${before.status} → ${parsed.data}`,
      metadata: { from: before.status, to: parsed.data },
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
        await recordLeadActivity(tx, {
          leadId,
          actorId,
          actorName,
          type: 'NOTE',
          content:
            '[Học thử] Đã tạo lịch học thử (chờ xếp lịch/giáo viên). Vào mục Học thử để cập nhật.',
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
    // Helper tự bump `lastActivityAt` khi (và CHỈ khi) đây là tiếp cận người thật —
    // nên KHÔNG còn `tx.lead.update` bằng tay ở đây. Trước 28/08 chỗ này là 1 trong
    // đúng 3 nơi nhớ bump, 12 nơi còn lại thì quên.
    await recordLeadActivity(tx, {
      leadId: input.leadId,
      actorId,
      actorName,
      type: parsedType.data,
      content,
      // Chỉ set khi caller có truyền metadata → tránh ghi đè null không cần.
      ...(input.metadata != null ? { metadata: input.metadata } : {}),
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

/**
 * Auto-chia 1 lead (round-robin).
 *
 * Trả về CẢ số liệu ghi danh — cùng lý do với {@link assignLeadToSaleAction}: lượt chia
 * nay kéo theo `Enrollment.saleId`, con số đó không được im lặng.
 *
 * Cách ly cơ sở đi qua CÙNG một phép đo với {@link assignLeadToSaleAction}
 * ({@link leadAssignCenterScope}). Hai action này dùng ĐÚNG một cổng quyền
 * (`leads:assign`, không target) và gây thiệt hại như nhau — rào chỉ một trong hai thì
 * kẻ bị chặn ở cửa trước đi cửa bên cạnh.
 */
export async function autoAssignLeadAction(
  leadId: string,
): Promise<{
  ok: boolean
  error?: string
  enrollmentsMoved?: number
  enrollmentsUnassigned?: number
  enrollmentsKept?: number
}> {
  const session = await auth()
  if (!session?.user) return { ok: false, error: 'Chưa đăng nhập' }
  if (!(await checkPermission('leads:assign'))) return { ok: false, error: 'Không có quyền' }

  const { actorId, actorName } = getAuditActor(session)
  const res = await autoAssignLead(
    leadId,
    { actorId, actorName },
    await leadAssignCenterScope(session.user.id),
  )
  if (!res.ok) return { ok: false, error: res.error }

  revalidatePath('/leads')
  revalidatePath(`/leads/${leadId}`)
  return {
    ok: true,
    enrollmentsMoved: res.enrollmentsMoved,
    enrollmentsUnassigned: res.enrollmentsUnassigned,
    enrollmentsKept: res.enrollmentsKept,
  }
}

// ⛔ `reassignLeadsFromAction` ĐÃ GỠ (27/08/2026) — KHÔNG khôi phục nguyên trạng.
//
// Nó là Server Action export từ file `'use server'` nhưng KHÔNG có call-site nào trong
// repo (không UI, không cron). Không có UI ≠ không có endpoint: Next.js vẫn phát hành nó.
// Cổng duy nhất là `checkPermission('leads:assign')` KHÔNG target — mà quyền đó seed
// `scopeType: "GLOBAL"` cho CENTER_MANAGER (`prisma/seed-roles.ts`) ⇒ nhánh GLOBAL của
// `can()` v2 khớp mọi cơ sở — rồi gọi thẳng `reassignOpenLeads(userId)`, hàm KHÔNG kiểm
// tầm nhìn cơ sở của người bấm ở bất cứ đâu. Một POST tay với `userId` của sale cơ sở
// khác chia lại TOÀN BỘ sổ lead đang mở của người đó theo lô 50, `strandedPolicy:
// "UNASSIGN"` GỠ `Enrollment.saleId` của mọi ghi danh khác cơ sở (phụ huynh mất người phụ
// trách) và đóng kênh riêng của họ với từng phụ huynh — không có đường hoàn tác vì từng
// lô đã commit.
//
// Đường "chia lại sổ lead khi sale nghỉ" THẬT vẫn sống và không đụng tới: nó nằm ở
// `toggleUserActive` (`app/(admin)/admin/users/_actions.ts`), gắn với hành động vô hiệu
// hoá tài khoản chứ không phải một endpoint trần. Cần dựng lại màn "chia lại tay" thì
// viết action mới CÓ cách ly cơ sở (khuôn `leadAssignCenterScope` ngay trên).
// Test ghim: `./actions.test.ts` — [F2].

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
  //
  // CỐ Ý không truyền tầm nhìn cơ sở (mặc định "ALL"), khác `autoAssignNewLeadAction`:
  // đây là bước hậu-tạo của chính lead vừa được tạo hợp lệ qua cổng `leads:create`, chứ
  // không phải một lệnh nhắm vào lead có sẵn của người khác. Siết ở đây sẽ khoá nhầm
  // đường thường: `leads:create` KHÔNG kèm `leads:assign` (Tư vấn & CSKH cơ sở có quyền
  // đầu, không có quyền sau — `prisma/seed-roles.ts`) ⇒ tập cơ sở rỗng ⇒ mọi lead nhập
  // tay im lặng không được chia cho ai (lời gọi này `.catch` nuốt cả lỗi lẫn `ok: false`).
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

/**
 * Auto-chia 1 lead theo cơ sở → chế độ (tôn trọng khoá khi đã tương tác).
 *
 * Cách ly cơ sở đi qua CÙNG phép đo với hai đường phân công kia
 * ({@link leadAssignCenterScope}). Riêng ở đây nó còn chặn một lượt ghi mà bản cũ để lọt
 * hoàn toàn: bước "định cơ sở" của `autoAssignNewLead` ĐỔI `Lead.centerId` — người cấp cơ
 * sở không được định tuyến một lead họ còn chưa nhìn thấy (lead từ web có `centerId = null`
 * mà `Lead ∉ NULL_IS_GLOBAL_MODELS`).
 */
export async function autoAssignNewLeadAction(
  leadId: string,
): Promise<{ ok: boolean; error?: string }> {
  const session = await auth()
  if (!session?.user) return { ok: false, error: 'Chưa đăng nhập' }
  if (!(await checkPermission('leads:assign'))) return { ok: false, error: 'Không có quyền' }

  const { actorId, actorName } = getAuditActor(session)
  const res = await autoAssignNewLead(
    leadId,
    { actorId, actorName },
    await leadAssignCenterScope(session.user.id),
  )
  if (!res.ok) return { ok: false, error: res.error }

  revalidatePath('/leads')
  revalidatePath(`/leads/${leadId}`)
  return { ok: true }
}

/**
 * Quản lý gán tay 1 lead cho 1 sale cụ thể.
 *
 * Trả về CẢ số liệu ghi danh: lượt gán tay nay kéo theo `Enrollment.saleId` — cột quyết
 * định ai còn nhắn riêng được với phụ huynh — nên `{ ok: true }` trần là để người vận hành
 * không biết ghi danh nào vừa đổi người phụ trách hoặc vừa ở lại với sale cũ.
 *
 * ── Cách ly cơ sở (chống IDOR ghi) ────────────────────────────────────────────
 * Cổng `leads:assign` ở trên KHÔNG cắt được việc này, và ĐỪNG "vá" bằng cách thêm
 * `{ centerId }` vào `checkPermission`: quyền đó seed `scopeType: "GLOBAL"` cho
 * CENTER_MANAGER (`prisma/seed-roles.ts`) ⇒ nhánh GLOBAL của `can()` v2 khớp MỌI
 * `target.centerId` — cùng lý lẽ đã ghi ở `setCenterAssignModeAction` bên dưới.
 * Ô chọn sale ở trang chi tiết đã lọc đúng cơ sở, nhưng đó là UI: Server Action là
 * endpoint công khai nên một POST tay đi vòng hết.
 *
 * Phép cắt thật nằm ở `visibleCenterIds` truyền xuống `manualAssignLead`: lead nguồn VÀ
 * sale nhận đều phải nằm trong tầm nhìn cơ sở của người bấm. Tham số đó CỐ Ý bắt buộc bên
 * lib — bỏ đi "cho gọn" là typecheck đỏ, không phải fail-open im lặng.
 *
 * ⚠️ Tập cơ sở đó tính bằng {@link leadAssignCenterScope}, KHÔNG phải
 * `getModelVisibleCenterIds('Lead', actor)` (thứ mà `ban-giao-lead/_actions.ts` còn dùng):
 * phép đo kia gom quyền theo TIỀN TỐ model nên một quyền chỉ-đọc của vai KIÊM NHIỆM cũng
 * làm nó nở ra "ALL" — đọc lý lẽ đầy đủ ở helper.
 */
export async function assignLeadToSaleAction(
  leadId: string,
  saleId: string,
): Promise<{
  ok: boolean
  error?: string
  enrollmentsMoved?: number
  enrollmentsUnassigned?: number
  enrollmentsKept?: number
}> {
  const session = await auth()
  if (!session?.user) return { ok: false, error: 'Chưa đăng nhập' }
  if (!(await checkPermission('leads:assign'))) return { ok: false, error: 'Không có quyền' }

  const { actorId, actorName } = getAuditActor(session)
  // SUPER_ADMIN → "ALL" (không giới hạn); còn lại = đúng các cơ sở đang GIỮ `leads:assign`.
  // Vì sao KHÔNG phải `getModelVisibleCenterIds`: xem {@link leadAssignCenterScope}.
  const visibleCenterIds = await leadAssignCenterScope(session.user.id)
  const res = await manualAssignLead(leadId, saleId, { actorId, actorName }, visibleCenterIds)
  if (!res.ok) return res

  revalidatePath('/leads')
  revalidatePath(`/leads/${leadId}`)
  return {
    ok: true,
    enrollmentsMoved: res.enrollmentsMoved,
    enrollmentsUnassigned: res.enrollmentsUnassigned,
    enrollmentsKept: res.enrollmentsKept,
  }
}

const ASSIGN_MODES = ['ROUND_ROBIN', 'CLOSE_RATE', 'MANUAL'] as const

/**
 * Quản lý cơ sở đặt chế độ chia cho CÁC CƠ SỞ MÌNH QUẢN LÝ; SUPER_ADMIN đặt mọi cơ sở.
 *
 * ── A-01-6 · bất biến L-A6 (26/08/2026) ────────────────────────────────────────
 * Đây là cổng GHI, và là cổng cách ly cơ sở DUY NHẤT của đường ghi này:
 *   · `db.leadAssignmentConfig.upsert` đi `db` TRẦN (file nằm trong allowlist loại B),
 *     mà `LeadAssignmentConfig` lại là SCOPE_EXEMPT (`lib/db-scope.ts`) ⇒ kể cả đi qua
 *     `scopedDb` cũng pass-through. `scopedDb` chỉ che đường ĐỌC — không trông vào nó.
 *   · Cổng ngoài `leads:assign` là GLOBAL với CENTER_MANAGER (`prisma/seed-roles.ts`)
 *     ⇒ `can()` v2 khớp MỌI `target.centerId` (`lib/auth/can.ts` — nhánh GLOBAL).
 *
 * Điều kiện cũ là `session.user.centerId !== centerId`, tức so với ĐÚNG MỘT cơ sở neo
 * (ảnh chụp lúc đăng nhập). Quản lý giữ 2 cơ sở đổi được chế độ chia của cơ sở neo mà
 * không đổi được của cơ sở thứ hai họ cũng đang quản lý.
 *
 * Phép đo hôm nay: cơ sở đích phải nằm trong tập cơ sở người này đang giữ CHÍNH vai
 * `CENTER_MANAGER` (`roleManagesCenter` — suy từ `PermEntry.roleCode` + `centerScope`,
 * tức từ đúng dòng `UserOrgRole` đẻ ra quyền).
 * ⚠️ KHÔNG dùng `visibleCenterIds`/`passesScope`: cả hai nở theo vai KIÊM NHIỆM (QLCS@CS1
 * kiêm kế toán@CS2, hoặc kiêm một vai Hội sở ⇒ `isHoLevel` ⇒ mọi cơ sở), nên AND chúng
 * lại vẫn không cắt gì. Lý lẽ đầy đủ: khối chú thích đầu `lib/auth/managed-centers.ts`.
 * Nới CHỈ MỘT CHIỀU cho vai QLCS — các vai khác không đi qua nhánh này, hành vi y nguyên.
 * Test ghim: `./actions.test.ts` ([L-A6], client ghi giả không lọc gì).
 */
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

  // CENTER_MANAGER (không kèm SUPER_ADMIN) chỉ đặt các cơ sở mình đang quản lý.
  const isSuper = hasRole(session.user, 'SUPER_ADMIN')
  if (!isSuper && hasRole(session.user, 'CENTER_MANAGER')) {
    const actor = await resolveActor(session.user.id)
    if (!roleManagesCenter(actor, 'CENTER_MANAGER', centerId)) {
      return { ok: false, error: 'Chỉ đặt được cơ sở bạn quản lý' }
    }
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
): Promise<{
  ok: boolean
  error?: string
  code?: string
  /** Số ghi danh đổi sang sale nhận — kênh riêng Sale↔PH sống trên cột này. */
  enrollmentsMoved?: number
  /** Số ghi danh bị GỠ phân công vì khác cơ sở (luật L2) — cần gán tay lại. */
  enrollmentsUnassigned?: number
  /** Số ghi danh khác cơ sở GIỮ NGUYÊN sale cũ (luật L2). */
  enrollmentsKept?: number
}> {
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
    // ⚠️ `centerId` ở đây KHÔNG phải để hiển thị — nó là cơ sở đem so với
    // `Enrollment.centerId` theo luật L2 (xem `applyLeadReassignment`). ĐỪNG thay bằng
    // `toCenterId`: `Enrollment.centerId` là bản sao cơ sở của LỚP, độc lập hoàn toàn với
    // cơ sở của lead — hai thứ tình cờ trùng nhau ở phần lớn ca nên nhầm lẫn này không tự
    // lộ ra. Test ghim: `./actions.transfer.test.ts` [T-3].
    toSaleId
      ? db.user.findUnique({ where: { id: toSaleId }, select: { name: true, centerId: true } })
      : null,
    lead.centerId ? db.center.findUnique({ where: { id: lead.centerId }, select: { name: true } }) : null,
    toCenterId ? db.center.findUnique({ where: { id: toCenterId }, select: { name: true } }) : null,
  ])

  /**
   * Lead đã bị một trong 6 đường đổi chủ khác xử lý (hoặc bị xoá mềm) giữa lúc `findFirst`
   * ở trên và lúc ghi. Ném ra để huỷ CẢ lượt: nếu chỉ bỏ qua, phiếu `LeadTransfer` + audit
   * vẫn nằm lại cho một việc đã không xảy ra, và ghi danh thì đã bị kéo sang sale mới.
   */
  class LeadRacedError extends Error {}

  // Không gán trị khởi tạo: nhánh `catch` dưới đây luôn `return` hoặc `throw`, nên chạy
  // tới dòng sau try/catch nghĩa là transaction đã commit và biến đã có giá trị thật.
  let outcome: LeadReassignOutcome
  try {
    outcome = await db.$transaction(
      async (tx) => {
        // ── Phần "đổi chủ" dùng chung (lib/lead/assignment-core.ts) ──
        // Đổi `assignedToId` + đặt `assignedAt` (mốc bắt đồng hồ SLA-3) + kéo
        // `Enrollment.saleId` theo LUẬT L1/L2 + ghi dòng thời gian. Hai luật đó viết đầy
        // đủ ở khối đầu module kia — ĐỌC Ở ĐÓ trước khi sửa bất cứ `where` nào chạm
        // `Enrollment.saleId`.
        const moved = await applyLeadReassignment({
          tx,
          leadIds: [lead.id],
          // Lặp lại bộ lọc đã dùng lúc CHỌN (`findFirst` ở trên), không chỉ `id`:
          // scopedDb KHÔNG che đường ghi.
          //
          // ⚠️ `assignedToId` LÀ PHẦN CÓ RĂNG của bộ lọc này — đây là compare-and-swap.
          // Chỉ `{ deletedAt: null }` thì mọi lead còn sống đều khớp, `leadsMoved` luôn
          // bằng 1, và `LeadRacedError` bên dưới chỉ nổ khi lead bị XOÁ MỀM — tức nhánh
          // "lead vừa bị đường khác đổi chủ" (6 đường còn lại) không bao giờ chạy. Khi đó
          // `fromUserId` đọc NGOÀI transaction đã cũ ⇒ lượt kéo `Enrollment.saleId` tìm
          // theo sale cũ không thấy gì, và kết cục là `Lead.assignedToId` một đằng,
          // `Enrollment.saleId` một nẻo — đúng loại phân kỳ mà module kia sinh ra để vá.
          leadWhere: { deletedAt: null, assignedToId: lead.assignedToId },
          fromUserId: lead.assignedToId,
          toUserId: toSaleId,
          // Cơ sở của SALE NHẬN — KHÔNG phải `toCenterId` của lead (luật L2).
          toSaleCenterId: toSale?.centerId ?? null,
          // Sale cũ ở đường này CÒN LÀM VIỆC (quản lý bấm "Chuyển lead", không phải bàn
          // giao khi nghỉ), nên ghi danh khác cơ sở GIỮ NGUYÊN người phụ trách: gỡ là xoá
          // một phân công đang chạy tốt và phụ huynh mất luôn kênh riêng với sale đó.
          strandedPolicy: 'KEEP',
          leadData: {
            // `centerId` là đủ — helper tự ghi kép sang `orgUnitId` (luật cứng Nền Hệ
            // thống #3), vì `updateMany` không đi qua extension ghi kép.
            centerId: toCenterId,
            handoverNote: d.handoverNote,
            ...(lead.status === 'NEW' && toSaleId ? { status: 'ASSIGNED' as const } : {}),
          },
          activity: {
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
        if (moved.leadsMoved === 0) throw new LeadRacedError()

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

        const bucket = moved.enrollmentsByLead.get(lead.id) ?? {
          moved: [],
          unassigned: [],
          kept: [],
        }
        const changedFields = ['assignedToId', 'centerId']
        if (bucket.moved.length > 0) changedFields.push('enrollmentSaleMoved')
        if (bucket.unassigned.length > 0) changedFields.push('enrollmentSaleUnassigned')
        if (bucket.kept.length > 0) changedFields.push('enrollmentSaleKept')

        await logLeadAudit({
          leadId: lead.id,
          action: 'ASSIGN',
          actorId,
          actorName,
          oldValues: { assignedToId: lead.assignedToId, centerId: lead.centerId },
          newValues: {
            assignedToId: toSaleId,
            centerId: toCenterId,
            // Ghi rõ ghi danh nào đổi sale phụ trách: đó là thứ quyết định ai còn nhắn
            // riêng được với phụ huynh. Ghi cả nhánh bị GỠ vì khác cơ sở — không có dòng
            // này thì không ai tra được vì sao ghi danh mất sale. Và ghi cả nhánh Ở LẠI
            // với sale cũ: từ đó `Lead.assignedToId` với `Enrollment.saleId` cố ý không
            // trùng nhau, phải có chỗ tra ra vì sao.
            enrollmentSaleMoved: bucket.moved,
            enrollmentSaleUnassigned: bucket.unassigned,
            enrollmentSaleKept: bucket.kept,
          },
          changedFields,
          tx,
        })

        // Mang RA NGOÀI tx: PH của MỌI ghi danh vừa đụng tới (để đóng kênh) + số liệu
        // để báo cho người bấm.
        return moved
      },
      // Luật E-bis #2 của module chat: transaction gánh thêm việc ngoài một thao tác đơn
      // phải nới trần. Lượt này nay ~9 lượt đi-về DB (đọc ghi danh + 2 lệnh ghi ghi danh +
      // activity + phiếu chuyển + 3 lượt của `logLeadAudit`) — mặc định Prisma là 5s/2s.
      { timeout: 30_000, maxWait: 10_000 },
    )
  } catch (err) {
    if (err instanceof LeadRacedError) {
      return { ok: false, error: 'Lead vừa được đổi chủ ở nơi khác — tải lại trang rồi thử lại' }
    }
    throw err
  }

  // Hiệu ứng phụ NGOÀI transaction: đóng kênh riêng Sale↔PH của sale cũ. Best-effort —
  // hàm tự nuốt lỗi + ghi log, KHÔNG rollback việc đã commit (luật cứng module chat #2);
  // lưới cuối vẫn là job đối soát đêm. KHÔNG mở kênh hộ sale MỚI (mở 1-1 là hành vi chủ
  // động của người dùng).
  if (lead.assignedToId) {
    await archiveDmOfPreviousSale(lead.assignedToId, outcome.affectedParentIds)
  }

  void fromCenter
  void toCenter
  revalidatePath('/leads')
  revalidatePath(`/leads/${lead.id}`)
  // Số liệu ghi danh ĐI RA TỚI NGƯỜI BẤM. Lượt chuyển lead nay kéo theo
  // `Enrollment.saleId` — thứ quyết định ai còn nhắn riêng được với phụ huynh — nên trả
  // `{ ok: true }` trần là để người vận hành không biết ghi danh nào vừa đổi/ở lại.
  return {
    ok: true,
    enrollmentsMoved: outcome.enrollmentsMoved,
    enrollmentsUnassigned: outcome.enrollmentsUnassigned,
    enrollmentsKept: outcome.enrollmentsKept,
  }
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

// ─── C-06 (§C.6.8) — đánh dấu RỚT ở cấp CON, lý do ghi ở cấp PHỤ HUYNH ────────
/**
 * ✅ QĐ 12(b) 24/08: KHÔNG có danh mục lý do rớt. Ghi chú tự do và BẮT BUỘC.
 * Hệ quả đã chấp nhận: không còn báo cáo "top lý do rớt" — cột này chỉ đọc từng dòng.
 */
const markChildLostSchema = z.object({
  leadChildId: z.string().min(1),
  lostNote: z.string().trim().min(1, 'Bắt buộc nhập lý do rớt').max(2000),
})

/**
 * Đánh dấu MỘT con của lead là rớt.
 *
 * 🔴 HÀM RIÊNG, cố ý KHÔNG sửa `updateLeadStatus`: hàm đó đổi trạng thái ở **cấp lead**
 * (phụ huynh) với chữ ký `(leadId, rawStatus)`. C-06 đổi ở **cấp con** và bắt buộc thêm
 * lý do. Nhồi vào hàm cũ là làm hai nghiệp vụ khác nhau dùng chung một đường ghi.
 *
 * ⚠️ Trạng thái rớt ở CON (`LeadChild.status`), lý do ở CHA (`Lead.lostNote`) — B5
 * 24/08. Hệ quả phải nói ra: phụ huynh có hai con, con thứ hai rớt sau sẽ **ghi đè**
 * ghi chú của con trước. Đó là cái giá đã biết của việc đặt lý do ở cấp phụ huynh.
 */
export async function markLeadChildLostAction(
  input: unknown,
): Promise<{ ok: boolean; error?: string }> {
  const session = await auth()
  if (!session?.user) return { ok: false, error: 'Chưa đăng nhập' }
  if (!(await checkPermission('leads:edit'))) return { ok: false, error: 'Không có quyền' }

  const parsed = markChildLostSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message }

  const actor = await resolveActor(session.user.id)
  const sdb = scopedDb(actor)

  // `scopedDb` KHÔNG che WRITE (chỉ auto-scope 7 method ĐỌC) ⇒ đọc qua sdb rồi vẫn
  // phải tự `passesScope` trước khi update. Bỏ bước này là QLCS CS1 sửa được con của CS2.
  const child = await sdb.leadChild.findFirst({
    where: { id: parsed.data.leadChildId },
    select: {
      id: true,
      status: true,
      leadId: true,
      fullName: true,
      lead: { select: { id: true, assignedToId: true, centerId: true } },
    },
  })
  if (!child || !passesScope('Lead', { centerId: child.lead?.centerId ?? null }, actor)) {
    return { ok: false, error: 'Không tìm thấy con của lead' }
  }
  if (!(await actorMayMutateLead(session.user.id, child.lead?.assignedToId ?? null))) {
    return { ok: false, error: MUTATE_DENIED }
  }
  if (child.status === 'ENROLLED') {
    // Con đã chốt rồi thì không "rớt" được — đảo chiều đó làm C3 mất tử số mà không
    // ai biết. Muốn sửa nhầm thì đi đường sửa trạng thái tường minh, không đi cửa này.
    return { ok: false, error: 'Học sinh đã chốt — không đánh dấu rớt được' }
  }

  const now = new Date()
  await db.$transaction(async (tx) => {
    await tx.leadChild.update({
      where: { id: child.id },
      data: { status: 'LOST', closedAt: null },
    })
    await tx.lead.update({
      where: { id: child.leadId },
      data: { lostNote: parsed.data.lostNote, lostAt: now },
    })
  })

  const { actorId, actorName } = getAuditActor(session)
  await logLeadAudit({
    leadId: child.leadId,
    action: 'UPDATE',
    actorId,
    actorName,
    newValues: {
      leadChildId: child.id,
      childName: child.fullName,
      childStatus: 'LOST',
      lostNote: parsed.data.lostNote,
    },
    changedFields: ['children', 'lostNote', 'lostAt'],
  }).catch(() => {})

  revalidatePath(`/leads/${child.leadId}`)
  revalidatePath('/leads')
  revalidatePath('/admin/dashboard')
  return { ok: true }
}
