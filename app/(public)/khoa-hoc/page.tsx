import type { Metadata } from 'next'
import { itemListJsonLd, breadcrumbJsonLd } from '@/lib/seo/jsonld'
import { CoursesHero } from './_components/courses-hero'
import { CourseCards } from './_components/course-cards'
import { ComparisonTable } from './_components/comparison-table'
import { CoursesFaq } from './_components/courses-faq'

const BASE_URL = 'https://satarobo.vn'

export const metadata: Metadata = {
  title: 'Khoá học Robotics & STEM — Sata Robo Đà Nẵng',
  description:
    '4 khoá học Robotics & STEM tại Sata Robo: RoboSim Master Online, Lập trình Robot Offline, Sata Inno School B2B và SATAGO du lịch giáo dục. Phù hợp học sinh lớp 1–9 và trường K-12.',
  openGraph: {
    title: 'Khoá học Robotics & STEM — Sata Robo',
    description:
      '4 hình thức học Robotics & STEM phù hợp mọi nhu cầu — từ online linh hoạt đến offline bài bản, từ B2B trường học đến trải nghiệm thực địa.',
    url: `${BASE_URL}/khoa-hoc`,
    siteName: 'Sata Robo',
    images: [
      {
        url: `${BASE_URL}/images/og/khoa-hoc.jpg`,
        width: 1200,
        height: 630,
        alt: 'Khoá học Robotics & STEM tại Sata Robo',
      },
    ],
    locale: 'vi_VN',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Khoá học Robotics & STEM — Sata Robo',
    description:
      '4 khoá học Robotics & STEM: RoboSim Online, Robot Offline, Inno School B2B, SATAGO du lịch giáo dục.',
    images: [`${BASE_URL}/images/og/khoa-hoc.jpg`],
  },
  alternates: {
    canonical: `${BASE_URL}/khoa-hoc`,
  },
}

const COURSE_LIST_ITEMS = [
  { position: 1, name: 'SP1 — RoboSim Master Online', url: `${BASE_URL}/khoa-hoc/luyen-thi-robosim` },
  { position: 2, name: 'SP2 — Lập trình Robot Offline', url: `${BASE_URL}/khoa-hoc/lap-trinh-robot` },
  { position: 3, name: 'SP3 — Sata Inno School B2B', url: `${BASE_URL}/lien-he?subject=sata-inno-school` },
  { position: 4, name: 'SP4 — SATAGO Du lịch giáo dục', url: `${BASE_URL}/lien-he?subject=satago` },
]

export default function CoursesPage() {
  return (
    <>
      {/* Static JSON-LD — no user input, dangerouslySetInnerHTML is safe here */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListJsonLd(COURSE_LIST_ITEMS)) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            breadcrumbJsonLd([
              { name: 'Trang chủ', url: '/' },
              { name: 'Khoá học', url: '/khoa-hoc' },
            ])
          ),
        }}
      />
      <CoursesHero />
      <CourseCards />
      <ComparisonTable />
      <CoursesFaq />
    </>
  )
}
