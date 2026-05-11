import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { hasPermission } from '@/lib/permissions'
import Link from 'next/link'
import { PenSquare, Plus } from 'lucide-react'
import { ContentActions } from './_components/content-actions'

function formatDate(date: Date) {
  return new Date(date).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

const CATEGORY_DISPLAY: Record<string, string> = {
  'phu-huynh': 'Phụ huynh',
  'tin-tuc': 'Tin tức',
  'giao-duc': 'Giáo dục',
  'doanh-nghiep': 'Doanh nghiệp',
}

export default async function ContentPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  if (!hasPermission(session.user, 'read', 'content')) redirect('/admin/dashboard')

  const canWrite = hasPermission(session.user, 'create', 'content')

  const posts = await db.blogPost.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      title: true,
      slug: true,
      category: true,
      isPublished: true,
      publishedAt: true,
      viewCount: true,
      readingTime: true,
      author: { select: { name: true } },
    },
  }).catch(() => [])

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Quản lý Blog</h1>
          <p className="mt-1 text-sm text-gray-500">{posts.length} bài viết</p>
        </div>
        {canWrite && (
          <Link
            href="/admin/content/new"
            className="inline-flex items-center gap-2 rounded-lg bg-[#7C3AED] px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
          >
            <Plus className="h-4 w-4" />
            Tạo bài viết
          </Link>
        )}
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-100">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Tiêu đề</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Danh mục</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Trạng thái</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Lượt xem</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Ngày đăng</th>
                {canWrite && (
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">Hành động</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {posts.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-sm text-gray-400">
                    Chưa có bài viết nào
                  </td>
                </tr>
              ) : (
                posts.map((post) => (
                  <tr key={post.id} className="hover:bg-gray-50/60">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="max-w-xs truncate font-medium text-gray-900">{post.title}</span>
                        <a
                          href={`/tin-tuc/${post.slug}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-gray-400 hover:text-gray-600"
                          title="Xem bài viết"
                        >
                          <PenSquare className="h-3.5 w-3.5" />
                        </a>
                      </div>
                      <div className="mt-0.5 text-xs text-gray-400">/{post.slug}</div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {post.category ? (CATEGORY_DISPLAY[post.category] ?? post.category) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${post.isPublished ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {post.isPublished ? 'Đã đăng' : 'Nháp'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm tabular-nums text-gray-600">{post.viewCount}</td>
                    <td className="px-4 py-3 text-sm tabular-nums text-gray-500">
                      {post.publishedAt ? formatDate(post.publishedAt) : '—'}
                    </td>
                    {canWrite && (
                      <td className="px-4 py-3 text-right">
                        <ContentActions
                          postId={post.id}
                          isPublished={post.isPublished}
                          slug={post.slug}
                        />
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
