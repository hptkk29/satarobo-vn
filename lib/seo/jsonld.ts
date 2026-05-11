import { marked } from 'marked'
import { HR_CONTACT } from '@/lib/data/job-options'

const BASE_URL = 'https://satarobo.vn'

export function organizationJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'Sata Robo',
    alternateName: 'Công ty Cổ phần Công nghệ Giáo dục Sata Robo',
    url: BASE_URL,
    logo: `${BASE_URL}/images/courses/lap-trinh-robot/LogoSataROBO.png`,
    contactPoint: {
      '@type': 'ContactPoint',
      telephone: '+84818823720',
      contactType: 'customer service',
      availableLanguage: 'Vietnamese',
    },
    address: {
      '@type': 'PostalAddress',
      streetAddress: '258 Lê Thanh Nghị',
      addressLocality: 'Đà Nẵng',
      addressCountry: 'VN',
    },
    sameAs: [
      'https://www.facebook.com/satarobo',
      'https://www.tiktok.com/@satarobo',
      'https://www.youtube.com/@satarobo',
    ],
  }
}

export function aboutPageJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'AboutPage',
    name: 'Về chúng tôi — Sata Robo',
    url: `${BASE_URL}/ve-chung-toi`,
    description:
      'Câu chuyện thương hiệu, tầm nhìn sứ mệnh và đội ngũ của Sata Robo — Hệ sinh thái Robotics & STEM giáo dục hàng đầu Đà Nẵng.',
    publisher: {
      '@type': 'Organization',
      name: 'Sata Robo',
      url: BASE_URL,
    },
  }
}

export function contactPageJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'ContactPage',
    name: 'Liên hệ — Sata Robo',
    url: `${BASE_URL}/lien-he`,
    description: 'Liên hệ với Sata Robo — Hotline, email và 4 cơ sở tại Đà Nẵng.',
  }
}

interface CenterInput {
  id: string
  name: string
  address: string
  phone: string | null
  email: string | null
}

export function localBusinessJsonLd(center: CenterInput) {
  return {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    '@id': `${BASE_URL}/lien-he#${center.id}`,
    name: center.name,
    address: {
      '@type': 'PostalAddress',
      streetAddress: center.address,
      addressLocality: 'Đà Nẵng',
      addressCountry: 'VN',
    },
    telephone: center.phone ?? undefined,
    email: center.email ?? undefined,
    url: BASE_URL,
    openingHours: 'Mo-Su 08:00-21:00',
    image: `${BASE_URL}/images/courses/lap-trinh-robot/LogoSataROBO.png`,
  }
}

export function itemListJsonLd(
  items: Array<{ url: string; name: string; position: number }>
) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    itemListElement: items.map((item) => ({
      '@type': 'ListItem',
      position: item.position,
      name: item.name,
      url: item.url,
    })),
  }
}

export interface ProductForJsonLd {
  slug: string
  name: string
  description: string
  price: number
  image: string
}

export function productJsonLd(product: ProductForJsonLd) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: product.description,
    image: `${BASE_URL}${product.image}`,
    offers: {
      '@type': 'Offer',
      price: product.price,
      priceCurrency: 'VND',
      availability: 'https://schema.org/InStock',
      url: `${BASE_URL}/hoc-cu#${product.slug}`,
    },
  }
}

export interface BlogPostingInput {
  title: string
  slug: string
  excerpt: string | null
  coverImage: string | null
  publishedAt: Date | null
  updatedAt: Date
  author: { name: string | null }
  category?: string | null
}

export function blogPostingJsonLd(post: BlogPostingInput) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    image: post.coverImage ?? undefined,
    datePublished: post.publishedAt?.toISOString(),
    dateModified: post.updatedAt.toISOString(),
    author: { '@type': 'Person', name: post.author.name ?? 'Sata Robo' },
    publisher: {
      '@type': 'Organization',
      name: 'Sata Robo',
      logo: {
        '@type': 'ImageObject',
        url: `${BASE_URL}/images/courses/lap-trinh-robot/LogoSataROBO.png`,
      },
    },
    description: post.excerpt ?? undefined,
    mainEntityOfPage: `${BASE_URL}/tin-tuc/${post.slug}`,
    articleSection: post.category ?? undefined,
    url: `${BASE_URL}/tin-tuc/${post.slug}`,
  }
}

const EMPLOYMENT_TYPE_MAP: Record<string, string> = {
  fulltime: 'FULL_TIME',
  parttime: 'PART_TIME',
  intern: 'INTERN',
  contract: 'CONTRACTOR',
}

function markdownToHtml(md: string): string {
  if (!md) return ''
  return String(marked.parse(md, { gfm: true, breaks: false })).trim()
}

export interface JobForJsonLd {
  slug: string
  title: string
  description: string
  requirements: string | null
  benefits: string | null
  location: string | null
  type: string | null
  salaryMin: number | null
  salaryMax: number | null
  openings: number
  createdAt: Date
  closesAt: Date | null
}

export function jobPostingJsonLd(job: JobForJsonLd) {
  const fullDescriptionHtml = [
    markdownToHtml(job.description),
    job.requirements ? markdownToHtml(job.requirements) : '',
    job.benefits ? markdownToHtml(job.benefits) : '',
  ].filter(Boolean).join('\n')

  // Always provide validThrough: default to 90 days from datePosted if closesAt is null
  const validThrough = job.closesAt
    ? job.closesAt.toISOString()
    : new Date(job.createdAt.getTime() + 90 * 24 * 60 * 60 * 1000).toISOString()

  const isRemote = job.location === 'online-hybrid' || job.location === 'remote'

  return {
    '@context': 'https://schema.org',
    '@type': 'JobPosting',
    title: job.title,
    description: fullDescriptionHtml,
    identifier: {
      '@type': 'PropertyValue',
      name: 'Sata Robo',
      value: job.slug,
    },
    datePosted: job.createdAt.toISOString().split('T')[0],
    validThrough,
    employmentType: EMPLOYMENT_TYPE_MAP[job.type ?? ''] ?? 'OTHER',
    hiringOrganization: {
      '@type': 'Organization',
      name: 'Công ty Cổ phần Công nghệ Giáo dục Sata Robo',
      sameAs: BASE_URL,
      logo: `${BASE_URL}/images/courses/lap-trinh-robot/LogoSataROBO.png`,
    },
    jobLocation: {
      '@type': 'Place',
      address: {
        '@type': 'PostalAddress',
        streetAddress: '258 Lê Thanh Nghị',
        addressLocality: 'Hoà Cường',
        addressRegion: 'Đà Nẵng',
        postalCode: '550000',
        addressCountry: 'VN',
      },
    },
    ...(isRemote && {
      jobLocationType: 'TELECOMMUTE',
      applicantLocationRequirements: {
        '@type': 'Country',
        name: 'Vietnam',
      },
    }),
    ...(job.salaryMin && job.salaryMax
      ? {
          baseSalary: {
            '@type': 'MonetaryAmount',
            currency: 'VND',
            value: {
              '@type': 'QuantitativeValue',
              minValue: job.salaryMin,
              maxValue: job.salaryMax,
              unitText: 'MONTH',
            },
          },
        }
      : {}),
    totalJobOpenings: job.openings,
    directApply: false,
    applicantContact: {
      '@type': 'ContactPoint',
      contactType: 'recruiter',
      email: HR_CONTACT.email,
      telephone: '+84' + HR_CONTACT.phoneRaw.substring(1),
    },
  }
}

export function breadcrumbJsonLd(items: Array<{ name: string; url: string }>) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: `${BASE_URL}${item.url}`,
    })),
  }
}
