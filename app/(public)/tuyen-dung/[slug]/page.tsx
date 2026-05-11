import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { db } from '@/lib/db'
import { MarkdownRenderer } from '@/components/blog/markdown-renderer'
import { ApplyCtaCard } from '@/components/jobs/apply-cta-card'
import { JobMeta } from '@/components/jobs/job-meta'
import { jobPostingJsonLd, breadcrumbJsonLd } from '@/lib/seo/jsonld'

export const revalidate = 60

const BASE_URL = 'https://satarobo.vn'

export async function generateStaticParams() {
  const jobs = await db.jobPosting.findMany({
    where: { status: 'OPEN' },
    select: { slug: true },
  })
  return jobs.map((j) => ({ slug: j.slug }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const job = await db.jobPosting.findUnique({ where: { slug } })
  if (!job || job.status !== 'OPEN') return {}

  const desc = job.description.replace(/[#*`[\]]/g, '').slice(0, 160)

  return {
    title: `${job.title} | Tuyển dụng Sata Robo`,
    description: desc,
    alternates: { canonical: `${BASE_URL}/tuyen-dung/${slug}` },
    openGraph: {
      title: `${job.title} — Tuyển dụng Sata Robo`,
      description: desc,
      type: 'article',
      url: `${BASE_URL}/tuyen-dung/${slug}`,
    },
  }
}

export default async function JobDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const job = await db.jobPosting.findUnique({ where: { slug } })

  if (!job || job.status !== 'OPEN') notFound()

  const breadcrumbs = [
    { name: 'Trang chủ', url: '/' },
    { name: 'Tuyển dụng', url: '/tuyen-dung' },
    { name: job.title, url: `/tuyen-dung/${job.slug}` },
  ]

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jobPostingJsonLd(job)) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd(breadcrumbs)) }}
      />

      <div className="container-site mx-auto max-w-6xl px-4 py-10">
        {/* Breadcrumb */}
        <nav className="mb-6 flex items-center gap-1 text-sm text-gray-500">
          {breadcrumbs.map((item, i) => (
            <span key={item.url} className="flex items-center gap-1">
              {i > 0 && <ChevronRight className="h-3.5 w-3.5" />}
              {i < breadcrumbs.length - 1 ? (
                <Link href={item.url} className="hover:text-[#7C3AED] hover:underline">
                  {item.name}
                </Link>
              ) : (
                <span className="font-medium text-gray-900 line-clamp-1">{item.name}</span>
              )}
            </span>
          ))}
        </nav>

        <div className="grid gap-8 lg:grid-cols-3">
          {/* Main content */}
          <div className="lg:col-span-2">
            <h1 className="mb-2 text-2xl font-black text-gray-900 sm:text-3xl">{job.title}</h1>
            <JobMeta job={job} />

            {job.description && (
              <section className="mt-8">
                <h2 className="mb-4 text-xl font-bold text-gray-900">Mô tả công việc</h2>
                <MarkdownRenderer content={job.description} />
              </section>
            )}

            {job.requirements && (
              <section className="mt-8">
                <h2 className="mb-4 text-xl font-bold text-gray-900">Yêu cầu công việc</h2>
                <MarkdownRenderer content={job.requirements} />
              </section>
            )}

            {job.benefits && (
              <section className="mt-8">
                <h2 className="mb-4 text-xl font-bold text-gray-900">Quyền lợi</h2>
                <MarkdownRenderer content={job.benefits} />
              </section>
            )}

            <div className="mt-10">
              <ApplyCtaCard job={job} variant="full" />
            </div>
          </div>

          {/* Sticky sidebar */}
          <aside className="lg:self-start lg:sticky lg:top-24">
            <ApplyCtaCard job={job} variant="compact" />

            <div className="mt-4 rounded-2xl border border-gray-100 bg-gray-50 p-4 text-sm text-gray-500">
              <p className="font-semibold text-gray-700">Chia sẻ vị trí này</p>
              <p className="mt-1">
                Biết ai phù hợp? Chia sẻ link trang này cho họ.
              </p>
              <Link
                href="/tuyen-dung"
                className="mt-3 inline-block text-sm font-semibold text-[#7C3AED] hover:underline"
              >
                ← Xem tất cả vị trí
              </Link>
            </div>
          </aside>
        </div>
      </div>
    </>
  )
}
