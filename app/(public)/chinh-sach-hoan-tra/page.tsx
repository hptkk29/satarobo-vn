import type { Metadata } from 'next'
import { promises as fs } from 'fs'
import path from 'path'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { MarkdownRenderer } from '@/components/blog/markdown-renderer'
import { breadcrumbJsonLd } from '@/lib/seo/jsonld'

export const metadata: Metadata = {
  title: 'Chính sách Hoàn trả Học phí',
  description:
    'Chính sách hoàn trả học phí và học cụ của Sata Robo — điều kiện hoàn trả, mức hoàn trả và quy trình yêu cầu hoàn tiền.',
  alternates: { canonical: 'https://satarobo.vn/chinh-sach-hoan-tra' },
  openGraph: {
    title: 'Chính sách Hoàn trả Học phí | Sata Robo',
    description: 'Điều kiện, mức hoàn trả và quy trình yêu cầu hoàn học phí tại Sata Robo.',
    url: 'https://satarobo.vn/chinh-sach-hoan-tra',
    siteName: 'Sata Robo',
  },
  robots: { index: true, follow: true },
}

const breadcrumb = breadcrumbJsonLd([
  { name: 'Trang chủ', url: '/' },
  { name: 'Chính sách Hoàn trả', url: '/chinh-sach-hoan-tra' },
])

export default async function ChinhSachHoanTraPage() {
  const filePath = path.join(process.cwd(), 'content', 'legal', 'chinh-sach-hoan-tra.md')
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
            <span className="text-gray-800 font-medium">Chính sách Hoàn trả</span>
          </nav>
        </div>
      </div>

      <div className="container mx-auto px-4 py-10 max-w-3xl">
        <MarkdownRenderer content={content} />
      </div>
    </>
  )
}
