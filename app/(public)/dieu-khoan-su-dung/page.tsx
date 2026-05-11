import type { Metadata } from 'next'
import { promises as fs } from 'fs'
import path from 'path'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { MarkdownRenderer } from '@/components/blog/markdown-renderer'
import { breadcrumbJsonLd } from '@/lib/seo/jsonld'

export const metadata: Metadata = {
  title: 'Điều khoản Sử dụng',
  description:
    'Điều khoản sử dụng website satarobo.vn — quyền và nghĩa vụ của người dùng khi truy cập và sử dụng dịch vụ của Sata Robo.',
  alternates: { canonical: 'https://satarobo.vn/dieu-khoan-su-dung' },
  openGraph: {
    title: 'Điều khoản Sử dụng | Sata Robo',
    description: 'Quyền và nghĩa vụ của người dùng khi sử dụng website và dịch vụ Sata Robo.',
    url: 'https://satarobo.vn/dieu-khoan-su-dung',
    siteName: 'Sata Robo',
  },
  robots: { index: true, follow: true },
}

const breadcrumb = breadcrumbJsonLd([
  { name: 'Trang chủ', url: '/' },
  { name: 'Điều khoản Sử dụng', url: '/dieu-khoan-su-dung' },
])

export default async function DieuKhoanSuDungPage() {
  const filePath = path.join(process.cwd(), 'content', 'legal', 'dieu-khoan-su-dung.md')
  const content = await fs.readFile(filePath, 'utf-8')

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }}
      />

      <div className="bg-gray-50 py-4">
        <div className="container mx-auto px-4">
          <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm text-gray-500">
            <Link href="/" className="hover:text-[#F97316] transition-colors">Trang chủ</Link>
            <ChevronRight className="h-3.5 w-3.5" />
            <span className="text-gray-800 font-medium">Điều khoản Sử dụng</span>
          </nav>
        </div>
      </div>

      <div className="container mx-auto px-4 py-10 max-w-3xl">
        <MarkdownRenderer content={content} />
      </div>
    </>
  )
}
