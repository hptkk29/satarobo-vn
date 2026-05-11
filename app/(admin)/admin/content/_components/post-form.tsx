'use client'

import { useTransition, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'

const CATEGORIES = [
  { value: 'phu-huynh', label: 'Phụ huynh' },
  { value: 'tin-tuc', label: 'Tin tức' },
  { value: 'giao-duc', label: 'Giáo dục' },
  { value: 'doanh-nghiep', label: 'Doanh nghiệp' },
]

function slugify(str: string) {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
}

interface PostFormProps {
  action: (formData: FormData) => Promise<{ error?: string } | void>
  defaultValues?: {
    title?: string
    slug?: string
    excerpt?: string
    content?: string
    category?: string
    tags?: string
    coverImage?: string
    seoTitle?: string
    seoDesc?: string
    ogImage?: string
    isPublished?: boolean
  }
  submitLabel?: string
}

export function PostForm({ action, defaultValues = {}, submitLabel = 'Tạo bài viết' }: PostFormProps) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [slug, setSlug] = useState(defaultValues.slug ?? '')
  const [isPublished, setIsPublished] = useState(defaultValues.isPublished ?? false)
  const router = useRouter()

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)
    const formData = new FormData(e.currentTarget)
    formData.set('slug', slug)
    formData.set('isPublished', String(isPublished))
    startTransition(async () => {
      const result = await action(formData)
      if (result && 'error' in result && result.error) {
        setError(result.error)
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main column */}
        <div className="space-y-5 lg:col-span-2">
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-gray-700">Tiêu đề *</label>
            <input
              name="title"
              defaultValue={defaultValues.title}
              required
              onChange={(e) => {
                if (!defaultValues.slug) setSlug(slugify(e.target.value))
              }}
              className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:border-[#7C3AED] focus:outline-none focus:ring-2 focus:ring-[#7C3AED]/20"
              placeholder="Tiêu đề bài viết..."
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-semibold text-gray-700">Slug *</label>
            <div className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2.5 focus-within:border-[#7C3AED] focus-within:ring-2 focus-within:ring-[#7C3AED]/20">
              <span className="shrink-0 text-xs text-gray-400">/tin-tuc/</span>
              <input
                name="slug"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                required
                className="min-w-0 flex-1 bg-transparent text-sm focus:outline-none"
                placeholder="duong-dan-bai-viet"
              />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-semibold text-gray-700">Tóm tắt</label>
            <textarea
              name="excerpt"
              defaultValue={defaultValues.excerpt}
              rows={3}
              maxLength={300}
              className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:border-[#7C3AED] focus:outline-none focus:ring-2 focus:ring-[#7C3AED]/20"
              placeholder="Mô tả ngắn về bài viết (hiển thị trong danh sách)..."
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-semibold text-gray-700">Nội dung (Markdown) *</label>
            <textarea
              name="content"
              defaultValue={defaultValues.content}
              required
              rows={20}
              className="w-full rounded-lg border border-gray-200 px-3 py-2.5 font-mono text-sm focus:border-[#7C3AED] focus:outline-none focus:ring-2 focus:ring-[#7C3AED]/20"
              placeholder="## Tiêu đề&#10;&#10;Nội dung bài viết..."
            />
          </div>

          {/* SEO */}
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-4">
            <h3 className="text-sm font-bold text-gray-700">SEO</h3>
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-600">SEO Title (max 70 ký tự)</label>
              <input
                name="seoTitle"
                defaultValue={defaultValues.seoTitle}
                maxLength={70}
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-[#7C3AED] focus:outline-none focus:ring-2 focus:ring-[#7C3AED]/20"
                placeholder="Để trống = dùng tiêu đề bài viết"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-600">SEO Description (max 160 ký tự)</label>
              <textarea
                name="seoDesc"
                defaultValue={defaultValues.seoDesc}
                maxLength={160}
                rows={2}
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-[#7C3AED] focus:outline-none focus:ring-2 focus:ring-[#7C3AED]/20"
                placeholder="Để trống = dùng tóm tắt bài viết"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-600">OG Image URL</label>
              <input
                name="ogImage"
                defaultValue={defaultValues.ogImage}
                type="url"
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-[#7C3AED] focus:outline-none focus:ring-2 focus:ring-[#7C3AED]/20"
                placeholder="https://..."
              />
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-5">
          {/* Publish */}
          <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
            <h3 className="text-sm font-bold text-gray-700">Xuất bản</h3>
            <label className="flex cursor-pointer items-center gap-3">
              <div className="relative">
                <input
                  type="checkbox"
                  checked={isPublished}
                  onChange={(e) => setIsPublished(e.target.checked)}
                  className="sr-only"
                />
                <div className={`h-6 w-11 rounded-full transition-colors ${isPublished ? 'bg-[#7C3AED]' : 'bg-gray-200'}`} />
                <div className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${isPublished ? 'translate-x-5' : ''}`} />
              </div>
              <span className="text-sm font-medium text-gray-700">
                {isPublished ? 'Đã đăng' : 'Nháp'}
              </span>
            </label>
            <button
              type="submit"
              disabled={pending}
              className="w-full rounded-lg bg-[#7C3AED] px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              {pending ? 'Đang lưu...' : submitLabel}
            </button>
            <button
              type="button"
              onClick={() => router.push('/admin/content')}
              className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-50"
            >
              Huỷ
            </button>
          </div>

          {/* Category & Tags */}
          <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-4">
            <h3 className="text-sm font-bold text-gray-700">Phân loại</h3>
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-600">Danh mục</label>
              <select
                name="category"
                defaultValue={defaultValues.category ?? ''}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[#7C3AED] focus:outline-none focus:ring-2 focus:ring-[#7C3AED]/20"
              >
                <option value="">Không có danh mục</option>
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-600">Tags (cách nhau bằng dấu phẩy)</label>
              <input
                name="tags"
                defaultValue={defaultValues.tags}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[#7C3AED] focus:outline-none focus:ring-2 focus:ring-[#7C3AED]/20"
                placeholder="robotics, stem, trẻ em"
              />
            </div>
          </div>

          {/* Cover image */}
          <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
            <h3 className="text-sm font-bold text-gray-700">Ảnh bìa</h3>
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-600">Cover Image URL</label>
              <input
                name="coverImage"
                defaultValue={defaultValues.coverImage}
                type="url"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[#7C3AED] focus:outline-none focus:ring-2 focus:ring-[#7C3AED]/20"
                placeholder="https://..."
              />
            </div>
          </div>
        </div>
      </div>
    </form>
  )
}
