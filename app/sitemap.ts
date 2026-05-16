import type { MetadataRoute } from 'next'
import { db } from '@/lib/db'

const BASE_URL = 'https://satarobo.vn'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: BASE_URL, lastModified: new Date(), changeFrequency: 'weekly', priority: 1 },
    { url: `${BASE_URL}/ve-chung-toi`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.8 },
    { url: `${BASE_URL}/khoa-hoc`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.9 },
    { url: `${BASE_URL}/khoa-hoc/laptrinhrobot`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.9 },
    { url: `${BASE_URL}/khoa-hoc/luyenthirobosim`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.9 },
    { url: `${BASE_URL}/hoc-cu`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.7 },
    { url: `${BASE_URL}/tuyen-dung`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.6 },
    { url: `${BASE_URL}/lien-he`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.7 },
    { url: `${BASE_URL}/tin-tuc`, lastModified: new Date(), changeFrequency: 'daily', priority: 0.8 },
    // /vinh-danh entries removed — section is hidden via layout.tsx 404.
    // Re-add when /vinh-danh is re-enabled.
    { url: `${BASE_URL}/chinh-sach-bao-mat`, lastModified: new Date(), changeFrequency: 'yearly', priority: 0.3 },
    { url: `${BASE_URL}/dieu-khoan-su-dung`, lastModified: new Date(), changeFrequency: 'yearly', priority: 0.3 },
    { url: `${BASE_URL}/chinh-sach-hoan-tra`, lastModified: new Date(), changeFrequency: 'yearly', priority: 0.3 },
  ]

  const [news, jobs] = await Promise.all([
    db.news
      .findMany({
        where: { isPublished: true },
        select: { slug: true, updatedAt: true },
        orderBy: { publishedAt: 'desc' },
      })
      .catch(() => []),
    db.jobPosting
      .findMany({
        where: { status: 'OPEN' },
        select: { slug: true, updatedAt: true },
      })
      .catch(() => []),
    // db.honor disabled — /vinh-danh section is 404 via layout.
  ])

  const newsRoutes: MetadataRoute.Sitemap = news.map((n) => ({
    url: `${BASE_URL}/tin-tuc/${n.slug}`,
    lastModified: n.updatedAt,
    changeFrequency: 'weekly',
    priority: 0.7,
  }))

  const jobRoutes: MetadataRoute.Sitemap = jobs.map((j) => ({
    url: `${BASE_URL}/tuyen-dung/${j.slug}`,
    lastModified: j.updatedAt,
    changeFrequency: 'weekly',
    priority: 0.6,
  }))

  return [...staticRoutes, ...newsRoutes, ...jobRoutes]
}
