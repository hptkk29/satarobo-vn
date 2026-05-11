import { auth } from '@/lib/auth'
import { redirect, notFound } from 'next/navigation'
import { hasPermission } from '@/lib/permissions'
import { db } from '@/lib/db'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { PostForm } from '../../_components/post-form'
import { updatePost } from '../../actions'

interface Params {
  params: Promise<{ id: string }>
}

export default async function EditPostPage({ params }: Params) {
  const session = await auth()
  if (!session?.user) redirect('/login')
  if (!hasPermission(session.user, 'create', 'content')) redirect('/admin/dashboard')

  const { id } = await params
  const post = await db.blogPost.findUnique({
    where: { id },
    select: {
      id: true, title: true, slug: true, excerpt: true, content: true,
      category: true, tags: true, coverImage: true, seoTitle: true,
      seoDesc: true, ogImage: true, isPublished: true,
    },
  }).catch(() => null)

  if (!post) notFound()

  const action = updatePost.bind(null, post.id)

  return (
    <div>
      <div className="mb-6">
        <Link
          href="/admin/content"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900"
        >
          <ChevronLeft className="h-4 w-4" />
          Quay lại
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-gray-900">Chỉnh sửa bài viết</h1>
      </div>

      <PostForm
        action={action}
        defaultValues={{
          ...post,
          excerpt: post.excerpt ?? undefined,
          category: post.category ?? undefined,
          tags: post.tags.join(', '),
          coverImage: post.coverImage ?? undefined,
          seoTitle: post.seoTitle ?? undefined,
          seoDesc: post.seoDesc ?? undefined,
          ogImage: post.ogImage ?? undefined,
        }}
        submitLabel="Lưu thay đổi"
      />
    </div>
  )
}
