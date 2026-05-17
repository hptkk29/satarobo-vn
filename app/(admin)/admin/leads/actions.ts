'use server'

import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { hasPermission } from '@/lib/permissions'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

const statusSchema = z.enum([
  'NEW',
  'CONTACTED',
  'DEMO_SCHEDULED',
  'ENROLLED',
  'NURTURING',
  'LOST',
])

export async function updateLeadStatus(
  leadId: string,
  rawStatus: string,
): Promise<{ ok: boolean; error?: string }> {
  const session = await auth()
  if (!session?.user) return { ok: false, error: 'Chua dang nhap' }
  if (!hasPermission(session.user, 'update', 'lead')) return { ok: false, error: 'Khong co quyen' }

  const parsed = statusSchema.safeParse(rawStatus)
  if (!parsed.success) return { ok: false, error: 'Trang thai khong hop le' }

  await db.lead.update({
    where: { id: leadId },
    data: { status: parsed.data },
  })

  revalidatePath('/admin/leads')
  return { ok: true }
}

export async function updateLeadNote(
  leadId: string,
  note: string,
): Promise<{ ok: boolean; error?: string }> {
  const session = await auth()
  if (!session?.user) return { ok: false, error: 'Chua dang nhap' }
  if (!hasPermission(session.user, 'update', 'lead')) return { ok: false, error: 'Khong co quyen' }

  await db.lead.update({
    where: { id: leadId },
    data: { note: note.trim() || null },
  })

  revalidatePath('/admin/leads')
  return { ok: true }
}

export async function deleteLead(
  leadId: string,
): Promise<{ ok: boolean; error?: string }> {
  const session = await auth()
  if (!session?.user) return { ok: false, error: 'Chua dang nhap' }
  if (!hasPermission(session.user, 'delete', 'lead')) {
    return { ok: false, error: 'Khong co quyen xoa lead' }
  }

  try {
    await db.lead.update({
      where: { id: leadId, deletedAt: null },
      data: { deletedAt: new Date() },
    })
  } catch {
    return { ok: false, error: 'Lead khong ton tai hoac da bi xoa' }
  }

  revalidatePath('/admin/leads')
  return { ok: true }
}
