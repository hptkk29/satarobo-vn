import type { Metadata } from 'next'
import { promises as fs } from 'fs'
import path from 'path'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { MarkdownRenderer } from '@/components/blog/markdown-renderer'
import { breadcrumbJsonLd } from '@/lib/seo/jsonld'

export const metadata: Metadata = {
  title: 'Chính sách Bảo mật',
  description:
    'Chính sách bảo mật thông tin của Sata Robo — cách chúng tôi thu thập, sử dụng và bảo vệ dữ liệu cá nhân của bạn theo NĐ 13/2023/NĐ-CP.',
  alternates: { canonical: 'https://satarobo.vn/chinh-sach-bao-mat' },
  openGraph: {
    title: 'Chính sách Bảo mật | Sata Robo',
    description: 'Cách Sata Robo thu thập, sử dụng và bảo vệ dữ liệu cá nhân của bạn.',
    url: 'https://satarobo.vn/chinh-sach-bao-mat',
    siteName: 'Sata Robo',
  },
  robots: { index: true, follow: true },
}

const breadcrumb = breadcrumbJsonLd([
  { name: 'Trang chủ', url: '/' },
  { name: 'Chính sách Bảo mật', url: '/chinh-sach-bao-mat' },
])

export default async function ChinhSachBaoMatPage() {
  const filePath = path.join(process.cwd(), 'content', 'legal', 'chinh-sach-bao-mat.md')
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
            <span className="text-gray-800 font-medium">Chính sách Bảo mật</span>
          </nav>
        </div>
      </div>

      <div className="container mx-auto px-4 py-10 max-w-3xl">
        <MarkdownRenderer content={content} />
      </div>
    </>
  )
}
