'use server'

import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { jobCreateSchema } from '@/lib/validators/job'

const CAN_EDIT = ['SUPER_ADMIN', 'MANAGER']

export async function createJobAction(input: unknown) {
  const session = await auth()
  if (!session?.user) return { ok: false, error: 'Chua dang nhap' }
  if (!CAN_EDIT.includes(session.user.role)) return { ok: false, error: 'Khong co quyen' }

  const parsed = jobCreateSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Du lieu khong hop le' }

  const existing = await db.jobPosting.findUnique({ where: { slug: parsed.data.slug } })
  if (existing) return { ok: false, error: 'Slug da ton tai, vui long chon slug khac' }

  const job = await db.jobPosting.create({
    data: {
      ...parsed.data,
      closesAt: parsed.data.closesAt ?? null,
      authorId: session.user.id,
    },
  })

  revalidatePath('/admin/jobs')
  revalidatePath('/tuyen-dung')

  return { ok: true, id: job.id }
}

export async function updateJobAction(id: string, input: unknown) {
  const session = await auth()
  if (!session?.user) return { ok: false, error: 'Chua dang nhap' }
  if (!CAN_EDIT.includes(session.user.role)) return { ok: false, error: 'Khong co quyen' }

  const parsed = jobCreateSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Du lieu khong hop le' }

  const job = await db.jobPosting.update({
    where: { id },
    data: {
      ...parsed.data,
      closesAt: parsed.data.closesAt ?? null,
    },
  })

  revalidatePath('/admin/jobs')
  revalidatePath('/tuyen-dung')
  revalidatePath(`/tuyen-dung/${job.slug}`)

  return { ok: true }
}

export async function deleteJobAction(id: string) {
  const session = await auth()
  if (!session?.user) return { ok: false }
  if (session.user.role !== 'SUPER_ADMIN') return { ok: false, error: 'Chi SUPER_ADMIN duoc xoa JD' }

  const job = await db.jobPosting.delete({ where: { id } })

  revalidatePath('/admin/jobs')
  revalidatePath('/tuyen-dung')
  revalidatePath(`/tuyen-dung/${job.slug}`)

  return { ok: true }
}

export async function duplicateJobAction(id: string) {
  const session = await auth()
  if (!session?.user) return { ok: false }
  if (!CAN_EDIT.includes(session.user.role)) return { ok: false, error: 'Khong co quyen' }

  const original = await db.jobPosting.findUnique({ where: { id } })
  if (!original) return { ok: false, error: 'Khong tim thay JD' }

  const newSlug = `${original.slug}-copy-${Date.now()}`
  const newJob = await db.jobPosting.create({
    data: {
      slug: newSlug,
      title: `[COPY] ${original.title}`,
      department: original.department,
      location: original.location,
      type: original.type,
      description: original.description,
      requirements: original.requirements,
      benefits: original.benefits,
      salary: original.salary,
      salaryMin: original.salaryMin,
      salaryMax: original.salaryMax,
      salaryNote: original.salaryNote,
      openings: original.openings,
      status: 'DRAFT',
      closesAt: original.closesAt,
      authorId: session.user.id,
    },
  })

  revalidatePath('/admin/jobs')
  return { ok: true, id: newJob.id }
}

export async function changeJobStatusAction(id: string, status: string) {
  const session = await auth()
  if (!session?.user) return { ok: false }
  if (!CAN_EDIT.includes(session.user.role)) return { ok: false }

  const job = await db.jobPosting.update({
    where: { id },
    data: { status: status as never },
  })

  revalidatePath('/admin/jobs')
  revalidatePath('/tuyen-dung')
  revalidatePath(`/tuyen-dung/${job.slug}`)

  return { ok: true }
}
