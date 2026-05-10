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
  if (!session?.user) return { ok: false, error: 'Chưa đăng nhập' }
  if (!hasPermission(session.user, 'update', 'lead')) return { ok: false, error: 'Không có quyền' }

  const parsed = statusSchema.safeParse(rawStatus)
  if (!parsed.success) return { ok: false, error: 'Trạng thái không hợp lệ' }

  await db.lead.update({
    where: { id: leadId },
    data: { status: parsed.data },
  })

  revalidatePath('/admin/leads')
  return { ok: true }
}
