import type { Metadata } from 'next'
import { db } from '@/lib/db'
import { contactPageJsonLd, localBusinessJsonLd, breadcrumbJsonLd } from '@/lib/seo/jsonld'
import { ContactHero } from './_components/contact-hero'
import { ContactInfo } from './_components/contact-info'
import { CentersGrid } from './_components/centers-grid'
import { ContactForm } from './_components/contact-form'
import { SocialLinks } from './_components/social-links'

const BASE_URL = 'https://satarobo.vn'

export const metadata: Metadata = {
  title: 'Liên hệ — Sata Robo Đà Nẵng',
  description:
    'Liên hệ Sata Robo — Hotline 0818.823.720, email satarobo@gmail.com. 4 cơ sở tại Đà Nẵng, phản hồi trong 30 phút giờ hành chính.',
  openGraph: {
    title: 'Liên hệ — Sata Robo',
    description:
      'Liên hệ tư vấn khoá học Robotics & STEM. Hotline 0818.823.720 — phản hồi trong 30 phút giờ hành chính.',
    url: `${BASE_URL}/lien-he`,
    siteName: 'Sata Robo',
    images: [
      {
        url: `${BASE_URL}/images/og/lien-he.jpg`,
        width: 1200,
        height: 630,
        alt: 'Liên hệ Sata Robo',
      },
    ],
    locale: 'vi_VN',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Liên hệ — Sata Robo',
    description: 'Hotline 0818.823.720 — 4 cơ sở tại Đà Nẵng — phản hồi 30 phút.',
    images: [`${BASE_URL}/images/og/lien-he.jpg`],
  },
  alternates: {
    canonical: `${BASE_URL}/lien-he`,
  },
}

export default async function ContactPage() {
  const centers = await db.center
    .findMany({
      where: { isActive: true },
      orderBy: { createdAt: 'asc' },
      select: { id: true, name: true, address: true, phone: true, email: true },
    })
    .catch(() => [])

  return (
    <>
      {/* Static JSON-LD — no user input, dangerouslySetInnerHTML is safe here */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(contactPageJsonLd()) }}
      />
      {centers.length > 0 && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(centers.map((c) => localBusinessJsonLd(c))),
          }}
        />
      )}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            breadcrumbJsonLd([
              { name: 'Trang chủ', url: '/' },
              { name: 'Liên hệ', url: '/lien-he' },
            ])
          ),
        }}
      />
      <ContactHero />
      <ContactInfo />
      <CentersGrid centers={centers} />
      <ContactForm />
      <SocialLinks />
    </>
  )
}
