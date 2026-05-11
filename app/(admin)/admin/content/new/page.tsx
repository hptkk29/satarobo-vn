import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { hasPermission } from '@/lib/permissions'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { PostForm } from '../_components/post-form'
import { createPost } from '../actions'

export default async function NewPostPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  if (!hasPermission(session.user, 'create', 'content')) redirect('/admin/dashboard')

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
        <h1 className="mt-2 text-2xl font-bold text-gray-900">Tạo bài viết mới</h1>
      </div>

      <PostForm action={createPost} submitLabel="Tạo bài viết" />
    </div>
  )
}
