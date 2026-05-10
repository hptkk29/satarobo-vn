import type { Metadata } from 'next'
import { TopCountdownBar } from './_components/top-countdown-bar'
import { Hero } from './_components/hero'
import { ContestInfo } from './_components/contest-info'
import { Roadmap5Years } from './_components/roadmap-5-years'
import { SpecialOfferCountdown } from './_components/special-offer-countdown'
import { TeachingMethod } from './_components/teaching-method'
import { Commitment } from './_components/commitment'
import { Gifts } from './_components/gifts'
import { InternalAwards } from './_components/internal-awards'
import { Testimonials } from './_components/testimonials'
import { FAQ } from './_components/faq'
import { RegistrationForm } from './_components/registration-form'
import { FinalCTA } from './_components/final-cta'
import { Locations } from './_components/locations'
import { FloatingCTA } from './_components/floating-cta'
import { AgeCoursePopup } from './_components/age-course-popup'

const BASE_URL = 'https://satarobo.vn'
const PAGE_URL = `${BASE_URL}/khoa-hoc/lap-trinh-robot`

export const metadata: Metadata = {
  title: 'Khóa học Lập trình Robot cho học sinh lớp 1-8 | Sata Robo',
  description:
    'Luyện thi Sáng tạo Robotics 2026 cùng Sata Robo Đà Nẵng. Khóa Robosim Master, Đấu trường Robot, Combo và lộ trình chuyên sâu 5 năm. Cam kết hoàn 100% học phí sau buổi đầu.',
  openGraph: {
    title: 'Khóa học Lập trình Robot cho học sinh lớp 1-8 | Sata Robo',
    description:
      'Luyện thi Sáng tạo Robotics 2026 cùng Sata Robo Đà Nẵng. Khóa Robosim Master, Đấu trường Robot, Combo và lộ trình chuyên sâu 5 năm. Cam kết hoàn 100% học phí sau buổi đầu.',
    url: PAGE_URL,
    siteName: 'Sata Robo',
    images: [
      {
        url: `${BASE_URL}/images/og/lap-trinh-robot.jpg`,
        width: 1200,
        height: 630,
        alt: 'Khóa học Lập trình Robot Sata Robo Đà Nẵng',
      },
    ],
    locale: 'vi_VN',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Khóa học Lập trình Robot cho học sinh lớp 1-8 | Sata Robo',
    description:
      'Luyện thi Sáng tạo Robotics 2026 cùng Sata Robo. Robosim Master, Đấu trường Robot, lộ trình 5 năm. 4 cơ sở tại Đà Nẵng.',
    images: [`${BASE_URL}/images/og/lap-trinh-robot.jpg`],
  },
  alternates: {
    canonical: PAGE_URL,
  },
}

// Static JSON-LD — no user input, dangerouslySetInnerHTML is safe here
const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'ItemList',
  name: 'Khóa học Lập trình Robot Sata Robo',
  description:
    'Các khóa luyện thi Robotics và lộ trình chuyên sâu 5 năm tại Sata Robo Đà Nẵng',
  url: PAGE_URL,
  itemListElement: [
    {
      '@type': 'ListItem',
      position: 1,
      item: {
        '@type': 'Course',
        name: 'Sata1 — Robosim Master',
        description:
          'Khóa luyện thi RoboSim 16 buổi dành cho học sinh lớp 3-5, làm chủ vòng loại.',
        url: `${PAGE_URL}#roadmap`,
        provider: { '@type': 'Organization', name: 'Sata Robo', sameAs: BASE_URL },
        offers: {
          '@type': 'Offer',
          price: '2040000',
          priceCurrency: 'VND',
          availability: 'https://schema.org/InStock',
        },
      },
    },
    {
      '@type': 'ListItem',
      position: 2,
      item: {
        '@type': 'Course',
        name: 'Sata2 — Đấu trường Robot',
        description:
          'Khóa luyện thi robot Beta 16 buổi dành cho học sinh lớp 6-9, luyện cấp khu vực.',
        url: `${PAGE_URL}#roadmap`,
        provider: { '@type': 'Organization', name: 'Sata Robo', sameAs: BASE_URL },
        offers: {
          '@type': 'Offer',
          price: '2584000',
          priceCurrency: 'VND',
          availability: 'https://schema.org/InStock',
        },
      },
    },
    {
      '@type': 'ListItem',
      position: 3,
      item: {
        '@type': 'Course',
        name: 'Combo Sata1 + Sata2 — Full Lộ Trình Luyện Thi',
        description: 'Học trọn RoboSim đến robot Beta, 32 buổi dành cho học sinh lớp 1-8.',
        url: `${PAGE_URL}#roadmap`,
        provider: { '@type': 'Organization', name: 'Sata Robo', sameAs: BASE_URL },
        offers: {
          '@type': 'Offer',
          price: '3808000',
          priceCurrency: 'VND',
          availability: 'https://schema.org/InStock',
        },
      },
    },
    {
      '@type': 'ListItem',
      position: 4,
      item: {
        '@type': 'Course',
        name: 'Sata8 — Vé Vàng Chung Kết',
        description:
          'Gói cam kết 5 buổi chuyên sâu, hoàn 100% học phí nếu không vượt vòng loại.',
        url: `${PAGE_URL}#roadmap`,
        provider: { '@type': 'Organization', name: 'Sata Robo', sameAs: BASE_URL },
        offers: {
          '@type': 'Offer',
          price: '2500000',
          priceCurrency: 'VND',
          availability: 'https://schema.org/InStock',
        },
      },
    },
  ],
}

export default function LapTrinhRobotPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <TopCountdownBar />
      <main>
        <Hero />
        <ContestInfo />
        <Roadmap5Years />
        <SpecialOfferCountdown />
        <TeachingMethod />
        <Commitment />
        <Gifts />
        <InternalAwards />
        <Testimonials />
        <FAQ />
        <RegistrationForm />
        <FinalCTA />
        <Locations />
      </main>
      <FloatingCTA />
      <AgeCoursePopup />
    </>
  )
}
