'use server'

import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { can } from '@/lib/auth/permissions'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { logLeadAudit, getAuditActor } from '@/lib/audit/log'
import { autoAssignLead, reassignOpenLeads } from '@/lib/lead/assign'

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
    select: { status: true },
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
  })

  revalidatePath('/leads')
  revalidatePath(`/leads/${leadId}`)
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
