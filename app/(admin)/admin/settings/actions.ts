'use server'

import { auth } from '@/lib/auth'
import { resolveActor } from '@/lib/auth/actor'
import { scopedDb } from '@/lib/db-scope'
import bcrypt from 'bcryptjs'
import { z } from 'zod'

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Nhap mat khau hien tai'),
  newPassword: z.string().min(8, 'Mat khau toi thieu 8 ky tu'),
  confirmPassword: z.string(),
})

export async function changePassword(formData: FormData): Promise<{ error?: string }> {
  const session = await auth()
  if (!session?.user?.id) return { error: 'Chua dang nhap' }
  // User ∈ SCOPE_EXEMPT → scopedDb pass-through (#03).
  const sdb = scopedDb(await resolveActor(session.user.id))

  const raw = {
    currentPassword: formData.get('currentPassword') as string,
    newPassword: formData.get('newPassword') as string,
    confirmPassword: formData.get('confirmPassword') as string,
  }

  const parsed = changePasswordSchema.safeParse(raw)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Du lieu khong hop le' }

  const { currentPassword, newPassword, confirmPassword } = parsed.data

  if (newPassword !== confirmPassword) return { error: 'Mat khau xac nhan khong khop' }

  const user = await sdb.user.findUnique({
    where: { id: session.user.id },
    select: { password: true },
  })

  if (!user?.password) return { error: 'Tai khoan nay khong su dung mat khau' }

  const valid = await bcrypt.compare(currentPassword, user.password)
  if (!valid) return { error: 'Mat khau hien tai khong dung' }

  const hashed = await bcrypt.hash(newPassword, 12)
  await sdb.user.update({ where: { id: session.user.id }, data: { password: hashed } })

  return {}
}
