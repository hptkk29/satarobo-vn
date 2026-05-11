'use server'

import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { hasPermission } from '@/lib/permissions'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { calcReadingTime } from '@/lib/blog-utils'

const PostSchema = z.object({
  title: z.string().min(5, 'Tiêu đề quá ngắn'),
  slug: z.string().min(3).regex(/^[a-z0-9-]+$/, 'Slug chỉ gồm chữ thường, số và dấu gạch ngang'),
  excerpt: z.string().max(300).optional(),
  content: z.string().min(1, 'Nội dung không được để trống'),
  category: z.string().optional(),
  tags: z.string().optional(),
  coverImage: z.string().url('URL ảnh không hợp lệ').optional().or(z.literal('')),
  seoTitle: z.string().max(70).optional(),
  seoDesc: z.string().max(160).optional(),
  ogImage: z.string().url().optional().or(z.literal('')),
  isPublished: z.boolean(),
})

async function requireContentPermission() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  if (!hasPermission(session.user, 'create', 'content')) {
    redirect('/admin/dashboard')
  }
  return session.user
}

export async function createPost(formData: FormData) {
  const user = await requireContentPermission()

  const raw = {
    title: formData.get('title') as string,
    slug: formData.get('slug') as string,
    excerpt: formData.get('excerpt') as string || undefined,
    content: formData.get('content') as string,
    category: formData.get('category') as string || undefined,
    tags: formData.get('tags') as string || undefined,
    coverImage: formData.get('coverImage') as string || undefined,
    seoTitle: formData.get('seoTitle') as string || undefined,
    seoDesc: formData.get('seoDesc') as string || undefined,
    ogImage: formData.get('ogImage') as string || undefined,
    isPublished: formData.get('isPublished') === 'true',
  }

  const parsed = PostSchema.safeParse(raw)
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const d = parsed.data
  const tagsArr = d.tags ? d.tags.split(',').map(t => t.trim()).filter(Boolean) : []

  try {
    await db.blogPost.create({
      data: {
        title: d.title,
        slug: d.slug,
        excerpt: d.excerpt || null,
        content: d.content,
        category: d.category || null,
        tags: tagsArr,
        coverImage: d.coverImage || null,
        seoTitle: d.seoTitle || null,
        seoDesc: d.seoDesc || null,
        ogImage: d.ogImage || null,
        isPublished: d.isPublished,
        publishedAt: d.isPublished ? new Date() : null,
        readingTime: calcReadingTime(d.content),
        authorId: user.id,
      },
    })
  } catch {
    return { error: 'Slug đã tồn tại hoặc lỗi cơ sở dữ liệu' }
  }

  revalidatePath('/tin-tuc')
  revalidatePath('/admin/content')
  redirect('/admin/content')
}

export async function updatePost(id: string, formData: FormData) {
  await requireContentPermission()

  const raw = {
    title: formData.get('title') as string,
    slug: formData.get('slug') as string,
    excerpt: formData.get('excerpt') as string || undefined,
    content: formData.get('content') as string,
    category: formData.get('category') as string || undefined,
    tags: formData.get('tags') as string || undefined,
    coverImage: formData.get('coverImage') as string || undefined,
    seoTitle: formData.get('seoTitle') as string || undefined,
    seoDesc: formData.get('seoDesc') as string || undefined,
    ogImage: formData.get('ogImage') as string || undefined,
    isPublished: formData.get('isPublished') === 'true',
  }

  const parsed = PostSchema.safeParse(raw)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Dữ liệu không hợp lệ' }
  }

  const d = parsed.data
  const tagsArr = d.tags ? d.tags.split(',').map(t => t.trim()).filter(Boolean) : []

  const existing = await db.blogPost.findUnique({ where: { id }, select: { isPublished: true, publishedAt: true } })
  if (!existing) return { error: 'Bài viết không tồn tại' }

  try {
    await db.blogPost.update({
      where: { id },
      data: {
        title: d.title,
        slug: d.slug,
        excerpt: d.excerpt || null,
        content: d.content,
        category: d.category || null,
        tags: tagsArr,
        coverImage: d.coverImage || null,
        seoTitle: d.seoTitle || null,
        seoDesc: d.seoDesc || null,
        ogImage: d.ogImage || null,
        isPublished: d.isPublished,
        publishedAt: d.isPublished && !existing.publishedAt ? new Date() : existing.publishedAt,
        readingTime: calcReadingTime(d.content),
      },
    })
  } catch {
    return { error: 'Slug đã tồn tại hoặc lỗi cơ sở dữ liệu' }
  }

  revalidatePath('/tin-tuc')
  revalidatePath(`/tin-tuc/${d.slug}`)
  revalidatePath('/admin/content')
  redirect('/admin/content')
}

export async function deletePost(id: string) {
  await requireContentPermission()
  await db.blogPost.delete({ where: { id } }).catch(() => {})
  revalidatePath('/tin-tuc')
  revalidatePath('/admin/content')
}

export async function togglePublish(id: string, isPublished: boolean) {
  await requireContentPermission()
  await db.blogPost.update({
    where: { id },
    data: {
      isPublished,
      publishedAt: isPublished ? new Date() : undefined,
    },
  })
  revalidatePath('/tin-tuc')
  revalidatePath('/admin/content')
}
