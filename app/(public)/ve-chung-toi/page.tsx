import type { Metadata } from 'next'
import { aboutPageJsonLd, breadcrumbJsonLd } from '@/lib/seo/jsonld'
import { AboutHero } from './_components/about-hero'
import { BrandStory } from './_components/brand-story'
import { VisionMission } from './_components/vision-mission'
import { OrgChart } from './_components/org-chart'
import { Team } from './_components/team'
import { Timeline } from './_components/timeline'

const BASE_URL = 'https://satarobo.vn'

export const metadata: Metadata = {
  title: 'Về chúng tôi — Sata Robo | Hệ sinh thái Robotics & STEM Đà Nẵng',
  description:
    'Câu chuyện Sata Robo — từ một ý tưởng nhỏ đến hệ sinh thái Robotics & STEM hàng đầu Đà Nẵng. Tầm nhìn, sứ mệnh, đội ngũ và hành trình 6 năm xây dựng.',
  openGraph: {
    title: 'Về chúng tôi — Sata Robo',
    description:
      'Câu chuyện thương hiệu, tầm nhìn sứ mệnh và đội ngũ của Sata Robo — Hệ sinh thái Robotics & STEM giáo dục hàng đầu Đà Nẵng.',
    url: `${BASE_URL}/ve-chung-toi`,
    siteName: 'Sata Robo',
    images: [
      {
        url: `${BASE_URL}/images/og/ve-chung-toi.jpg`,
        width: 1200,
        height: 630,
        alt: 'Về chúng tôi — Sata Robo',
      },
    ],
    locale: 'vi_VN',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Về chúng tôi — Sata Robo',
    description: 'Câu chuyện thương hiệu, tầm nhìn sứ mệnh và đội ngũ của Sata Robo.',
    images: [`${BASE_URL}/images/og/ve-chung-toi.jpg`],
  },
  alternates: {
    canonical: `${BASE_URL}/ve-chung-toi`,
  },
}

export default function AboutPage() {
  return (
    <>
      {/* Static JSON-LD — no user input, dangerouslySetInnerHTML is safe here */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(aboutPageJsonLd()) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            breadcrumbJsonLd([
              { name: 'Trang chủ', url: '/' },
              { name: 'Về chúng tôi', url: '/ve-chung-toi' },
            ])
          ),
        }}
      />
      <AboutHero />
      <BrandStory />
      <VisionMission />
      <OrgChart />
      <Team />
      <Timeline />
    </>
  )
}
