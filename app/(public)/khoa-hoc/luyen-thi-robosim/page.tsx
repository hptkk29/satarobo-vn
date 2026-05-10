import type { Metadata } from 'next'
import { TopCountdownBar } from './_components/top-countdown-bar'
import { Hero } from './_components/hero'
import { ContestInfo } from './_components/contest-info'
import { Pain } from './_components/pain'
import { Solution } from './_components/solution'
import { Courses } from './_components/courses'
import { Roadmap } from './_components/roadmap'
import { Results } from './_components/results'
import { Testimonials } from './_components/testimonials'
import { FinalCTA } from './_components/final-cta'
import { FAQ } from './_components/faq'
import { FloatingButtons } from './_components/floating-buttons'
import { ExitIntentPopup } from './_components/exit-intent-popup'

const BASE_URL = 'https://satarobo.vn'
const PAGE_URL = `${BASE_URL}/khoa-hoc/luyen-thi-robosim`

export const metadata: Metadata = {
  title: 'Khoá Luyện Thi RoboSim — Pass Vòng Loại RBT2026 | Sata Robo',
  description:
    'Khoá Luyện Thi RoboSim của Sata Robo — đưa con vào TOP, pass vòng loại Sáng tạo Robotics 2026 ngày 26/07. Bảng R1 (Tiểu học) và R2 (THCS), 18 buổi video, 490.000đ, giảm đến 45%.',
  openGraph: {
    title: 'Khoá Luyện Thi RoboSim — Pass Vòng Loại RBT2026 | Sata Robo',
    description:
      'Khoá Luyện Thi RoboSim của Sata Robo — đưa con vào TOP, pass vòng loại Sáng tạo Robotics 2026 ngày 26/07. Bảng R1 (Tiểu học) và R2 (THCS), 18 buổi video, 490.000đ.',
    url: PAGE_URL,
    siteName: 'Sata Robo',
    images: [
      {
        url: `${BASE_URL}/images/og/luyen-thi-robosim.jpg`,
        width: 1200,
        height: 630,
        alt: 'Khoá Luyện Thi RoboSim Sata Robo — Pass Vòng Loại RBT2026',
      },
    ],
    locale: 'vi_VN',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Khoá Luyện Thi RoboSim — Pass Vòng Loại RBT2026 | Sata Robo',
    description:
      'Đưa con vào TOP pass vòng loại RBT2026. Bảng R1 & R2. 18 buổi video, 490.000đ, giảm đến 45%.',
    images: [`${BASE_URL}/images/og/luyen-thi-robosim.jpg`],
  },
  alternates: {
    canonical: PAGE_URL,
  },
}

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'ItemList',
  name: 'Khoá Luyện Thi RoboSim Sata Robo',
  description: 'Khoá luyện thi vòng loại Sáng tạo Robotics 2026 — Bảng R1 và R2 tại Sata Robo',
  url: PAGE_URL,
  itemListElement: [
    {
      '@type': 'ListItem',
      position: 1,
      item: {
        '@type': 'Course',
        name: 'Khoá Luyện Thi RoboSim — Bảng R1 (Tiểu học)',
        description:
          'Khoá luyện thi 18 buổi dành cho học sinh lớp 3–5, đưa con vào TOP vòng loại RBT2026 bảng R1.',
        url: `${PAGE_URL}#courses`,
        provider: { '@type': 'Organization', name: 'Sata Robo', sameAs: BASE_URL },
        offers: {
          '@type': 'Offer',
          price: '490000',
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
        name: 'Khoá Luyện Thi RoboSim — Bảng R2 (THCS)',
        description:
          'Khoá luyện thi 18 buổi dành cho học sinh lớp 6–9, đưa con vào TOP vòng loại RBT2026 bảng R2.',
        url: `${PAGE_URL}#courses`,
        provider: { '@type': 'Organization', name: 'Sata Robo', sameAs: BASE_URL },
        offers: {
          '@type': 'Offer',
          price: '490000',
          priceCurrency: 'VND',
          availability: 'https://schema.org/InStock',
        },
      },
    },
  ],
}

export default function LuyenThiRoboSimPage() {
  return (
    <>
      {/* Static JSON-LD — no user input, dangerouslySetInnerHTML is safe here */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <TopCountdownBar />
      <main>
        <Hero />
        <ContestInfo />
        <Pain />
        <Solution />
        <Courses />
        <Roadmap />
        <Results />
        <Testimonials />
        <FinalCTA />
        <FAQ />
      </main>
      <FloatingButtons />
      <ExitIntentPopup />
    </>
  )
}
