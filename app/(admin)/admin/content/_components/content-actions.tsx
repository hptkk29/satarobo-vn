'use client'

import { useTransition } from 'react'
import Link from 'next/link'
import { Edit, Trash2, Eye, EyeOff, Loader2 } from 'lucide-react'
import { togglePublish, deletePost } from '../actions'

interface ContentActionsProps {
  postId: string
  isPublished: boolean
  slug?: string
}

export function ContentActions({ postId, isPublished }: ContentActionsProps) {
  const [pending, startTransition] = useTransition()

  const handleToggle = () => {
    startTransition(async () => {
      await togglePublish(postId, !isPublished)
    })
  }

  const handleDelete = () => {
    if (!confirm('Xoá bài viết này? Hành động không thể hoàn tác.')) return
    startTransition(async () => {
      await deletePost(postId)
    })
  }

  return (
    <div className="flex items-center justify-end gap-1">
      {pending ? (
        <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
      ) : (
        <>
          <Link
            href={`/admin/content/${postId}/edit`}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
            title="Chỉnh sửa"
          >
            <Edit className="h-4 w-4" />
          </Link>
          <button
            type="button"
            onClick={handleToggle}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
            title={isPublished ? 'Ẩn bài' : 'Đăng bài'}
          >
            {isPublished ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
          <button
            type="button"
            onClick={handleDelete}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"
            title="Xoá"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </>
      )}
    </div>
  )
}
