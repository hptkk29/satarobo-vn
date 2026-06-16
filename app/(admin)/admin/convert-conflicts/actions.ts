'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { scopedDb } from '@/lib/db-scope'
import { resolveActor } from '@/lib/auth/actor'
import { hasRole } from '@/lib/auth/permissions'
import { getAuditActor } from '@/lib/audit/log'
import { writeAudit } from '@/lib/audit/audit-log'

// ─── R7-05 — màn Admin xử lý xung đột dedupe parent (AC3) ─────────────────────
// Chỉ SUPER_ADMIN / CENTER_MANAGER. Hai cách xử lý:
//   - merge "B → A": gộp học viên của hồ sơ B vào hồ sơ A (theo email) → lần convert
//     sau cả email & phone trỏ về A → reuse, hết xung đột.
//   - dismiss: đánh dấu đã xử lý thủ công (ghi lý do) mà không gộp tự động.

function canResolve(user: Parameters<typeof hasRole>[0]) {
  return hasRole(user, 'SUPER_ADMIN') || hasRole(user, 'CENTER_MANAGER')
}

const resolveSchema = z.object({
  conflictId: z.string().trim().min(1),
  note: z.string().trim().max(2000).optional().or(z.literal('')),
})

/** Gộp hồ sơ B (khớp phone) vào hồ sơ A (khớp email) rồi đóng xung đột. */
export async function mergeConflictIntoA(input: unknown): Promise<{ ok: boolean; error?: string }> {
  const session = await auth()
  if (!session?.user) return { ok: false, error: 'Chưa đăng nhập' }
  if (!canResolve(session.user)) return { ok: false, error: 'Không có quyền xử lý xung đột' }

  const parsed = resolveSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'Dữ liệu không hợp lệ' }

  const sdb = scopedDb(await resolveActor(session.user.id))
  const conflict = await sdb.convertConflict.findUnique({
    where: { id: parsed.data.conflictId },
    select: { id: true, leadId: true, parentAId: true, parentBId: true, status: true },
  })
  if (!conflict) return { ok: false, error: 'Không tìm thấy xung đột' }
  if (conflict.status !== 'OPEN') return { ok: false, error: 'Xung đột đã được xử lý' }

  const { actorId, actorName } = getAuditActor(session)

  await sdb.$transaction(async (tx) => {
    // Chuyển học viên của B sang A → phone sẽ trỏ về A ở lần convert sau.
    const moved = await tx.student.updateMany({
      where: { parentUserId: conflict.parentBId, deletedAt: null },
      data: { parentUserId: conflict.parentAId },
    })
    await tx.convertConflict.update({
      where: { id: conflict.id },
      data: {
        status: 'RESOLVED',
        resolvedById: actorId,
        note: parsed.data.note || `Gộp hồ sơ B → A (${moved.count} học viên)`,
      },
    })
    await writeAudit({
      actor: { id: actorId, name: actorName },
      module: 'enrollment',
      entityType: 'ConvertConflict',
      entityId: conflict.id,
      action: 'CONVERT_CONFLICT_MERGED',
      newValues: {
        leadId: conflict.leadId,
        keepParentId: conflict.parentAId,
        mergedFromParentId: conflict.parentBId,
        movedStudents: moved.count,
      },
      reason: parsed.data.note || undefined,
    })
  })

  revalidatePath('/convert-conflicts')
  revalidatePath(`/leads/${conflict.leadId}`)
  return { ok: true }
}

/** Đánh dấu đã xử lý thủ công (không gộp tự động) — cần ghi lý do. */
export async function dismissConflict(input: unknown): Promise<{ ok: boolean; error?: string }> {
  const session = await auth()
  if (!session?.user) return { ok: false, error: 'Chưa đăng nhập' }
  if (!canResolve(session.user)) return { ok: false, error: 'Không có quyền xử lý xung đột' }

  const parsed = resolveSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'Dữ liệu không hợp lệ' }
  const note = parsed.data.note?.trim()
  if (!note) return { ok: false, error: 'Cần ghi lý do/cách xử lý' }

  const sdb = scopedDb(await resolveActor(session.user.id))
  const conflict = await sdb.convertConflict.findUnique({
    where: { id: parsed.data.conflictId },
    select: { id: true, leadId: true, parentAId: true, parentBId: true, status: true },
  })
  if (!conflict) return { ok: false, error: 'Không tìm thấy xung đột' }
  if (conflict.status !== 'OPEN') return { ok: false, error: 'Xung đột đã được xử lý' }

  const { actorId, actorName } = getAuditActor(session)
  await sdb.$transaction(async (tx) => {
    await tx.convertConflict.update({
      where: { id: conflict.id },
      data: { status: 'RESOLVED', resolvedById: actorId, note },
    })
    await writeAudit({
      actor: { id: actorId, name: actorName },
      module: 'enrollment',
      entityType: 'ConvertConflict',
      entityId: conflict.id,
      action: 'CONVERT_CONFLICT_DISMISSED',
      newValues: { leadId: conflict.leadId },
      reason: note,
    })
  })

  revalidatePath('/convert-conflicts')
  revalidatePath(`/leads/${conflict.leadId}`)
  return { ok: true }
}
