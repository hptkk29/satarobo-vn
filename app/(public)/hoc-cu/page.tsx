import type { Metadata } from 'next'
import { itemListJsonLd, breadcrumbJsonLd } from '@/lib/seo/jsonld'
import { PRODUCTS } from '@/lib/data/products'
import { HocCuHero } from './_components/hoc-cu-hero'
import { ProductsSection } from './_components/products-section'
import { HocCuCta } from './_components/hoc-cu-cta'

const BASE_URL = 'https://satarobo.vn'

export const metadata: Metadata = {
  title: 'Học cụ Robotics chính hãng — Sata Robo',
  description:
    'Bộ học cụ Robotics chính hãng Sata Robo — thiết kế riêng cho từng độ tuổi, đồng bộ với chương trình giảng dạy. 8 sản phẩm từ cơ bản đến nâng cao, phụ kiện đi kèm.',
  openGraph: {
    title: 'Học cụ Robotics chính hãng — Sata Robo',
    description:
      '8 bộ học cụ Robotics thiết kế riêng cho từng độ tuổi, đồng bộ với chương trình SP2 Lập trình Robot Offline tại Sata Robo Đà Nẵng.',
    url: `${BASE_URL}/hoc-cu`,
    siteName: 'Sata Robo',
    images: [
      {
        url: `${BASE_URL}/images/og/hoc-cu.jpg`,
        width: 1200,
        height: 630,
        alt: 'Học cụ Robotics chính hãng Sata Robo',
      },
    ],
    locale: 'vi_VN',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Học cụ Robotics chính hãng — Sata Robo',
    description: '8 bộ học cụ Robotics chính hãng Sata Robo — từ cơ bản đến nâng cao.',
    images: [`${BASE_URL}/images/og/hoc-cu.jpg`],
  },
  alternates: {
    canonical: `${BASE_URL}/hoc-cu`,
  },
}

export default function HocCuPage() {
  const productListItems = PRODUCTS.map((p, i) => ({
    position: i + 1,
    name: p.name,
    url: `${BASE_URL}/hoc-cu#${p.slug}`,
  }))

  return (
    <>
      {/* Static JSON-LD — no user input, dangerouslySetInnerHTML is safe here */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListJsonLd(productListItems)) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            breadcrumbJsonLd([
              { name: 'Trang chủ', url: '/' },
              { name: 'Học cụ', url: '/hoc-cu' },
            ])
          ),
        }}
      />
      <HocCuHero />
      <ProductsSection />
      <HocCuCta />
    </>
  )
}
