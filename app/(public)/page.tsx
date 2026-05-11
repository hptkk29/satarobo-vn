import type { Metadata } from 'next'
import { db } from '@/lib/db'
import { organizationJsonLd, websiteJsonLd } from '@/lib/seo/jsonld'
import { Hero } from './_components/hero'
import { Products } from './_components/products'
import { WhySata } from './_components/why-sata'
import { Achievements } from './_components/achievements'
import { Testimonials } from './_components/testimonials'
import { LatestPosts } from './_components/latest-posts'
import { CtaSection } from './_components/cta-section'

const BASE_URL = 'https://satarobo.vn'

export const metadata: Metadata = {
  title: 'Sata Robo — Hệ sinh thái Robotics & STEM giáo dục hàng đầu Đà Nẵng',
  description:
    'Sata Robo — Trung tâm Robotics & STEM hàng đầu Đà Nẵng. Khoá Luyện thi RoboSim Online, Lập trình Robot Offline, Sata Inno School B2B và SATAGO du lịch giáo dục. 1.000+ học viên, cam kết hoàn 100% học phí.',
  openGraph: {
    title: 'Sata Robo — Hệ sinh thái Robotics & STEM giáo dục',
    description:
      'Trung tâm Robotics & STEM hàng đầu Đà Nẵng cho học sinh lớp 1-8. 4 cơ sở, 1.000+ học viên, cam kết kết quả.',
    url: BASE_URL,
    siteName: 'Sata Robo',
    images: [
      {
        url: `${BASE_URL}/images/og/homepage.jpg`,
        width: 1200,
        height: 630,
        alt: 'Sata Robo — Hệ sinh thái Robotics & STEM giáo dục hàng đầu Đà Nẵng',
      },
    ],
    locale: 'vi_VN',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Sata Robo — Hệ sinh thái Robotics & STEM giáo dục',
    description:
      'Trung tâm Robotics & STEM hàng đầu Đà Nẵng. 1.000+ học viên, 4 cơ sở, cam kết hoàn 100% học phí.',
    images: [`${BASE_URL}/images/og/homepage.jpg`],
  },
  alternates: {
    canonical: BASE_URL,
  },
}

const orgJsonLd = organizationJsonLd()
const siteJsonLd = websiteJsonLd()

export default async function HomePage() {
  const posts = await db.blogPost
    .findMany({
      where: { isPublished: true },
      orderBy: { publishedAt: 'desc' },
      take: 3,
      select: {
        id: true,
        title: true,
        slug: true,
        excerpt: true,
        coverImage: true,
        publishedAt: true,
      },
    })
    .catch(() => [])

  return (
    <>
      {/* Static JSON-LD — no user input, dangerouslySetInnerHTML is safe here */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(orgJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(siteJsonLd) }}
      />
      <Hero />
      <Products />
      <WhySata />
      <Achievements />
      <Testimonials />
      <LatestPosts posts={posts} />
      <CtaSection />
    </>
  )
}
