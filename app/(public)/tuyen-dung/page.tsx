import type { Metadata } from 'next'
import { Heart } from 'lucide-react'
import { db } from '@/lib/db'
import { breadcrumbJsonLd, organizationJsonLd } from '@/lib/seo/jsonld'
import { JobCard } from '@/components/jobs/job-card'
import { JobFilters } from '@/components/jobs/job-filters'
import { HR_CONTACT } from '@/lib/data/job-options'

export const revalidate = 60

const BASE_URL = 'https://satarobo.vn'

export const metadata: Metadata = {
  title: 'Tuyển dụng — Cơ hội nghề nghiệp tại Sata Robo',
  description:
    'Sata Robo tuyển dụng giáo viên Robotics, Sales, Marketing tại Đà Nẵng. Môi trường năng động, đam mê giáo dục công nghệ.',
  alternates: { canonical: `${BASE_URL}/tuyen-dung` },
  openGraph: {
    title: 'Tuyển dụng — Sata Robo',
    description: 'Gia nhập đội ngũ Sata Robo — nơi đam mê giáo dục và công nghệ gặp nhau.',
    url: `${BASE_URL}/tuyen-dung`,
    siteName: 'Sata Robo',
    locale: 'vi_VN',
    type: 'website',
  },
}

interface SearchParams {
  searchParams: Promise<{ department?: string; location?: string; type?: string }>
}

export default async function TuyenDungPage({ searchParams }: SearchParams) {
  const sp = await searchParams

  const jobs = await db.jobPosting.findMany({
    where: {
      status: 'OPEN',
      ...(sp.department ? { department: sp.department } : {}),
      ...(sp.location ? { location: sp.location } : {}),
      ...(sp.type ? { type: sp.type } : {}),
    },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      slug: true,
      title: true,
      department: true,
      location: true,
      type: true,
      salaryMin: true,
      salaryMax: true,
      salaryNote: true,
      openings: true,
      closesAt: true,
      createdAt: true,
    },
  })

  const hasFilters = !!(sp.department || sp.location || sp.type)

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd()) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            breadcrumbJsonLd([
              { name: 'Trang chủ', url: '/' },
              { name: 'Tuyển dụng', url: '/tuyen-dung' },
            ]),
          ),
        }}
      />

      {/* Hero */}
      <section
        className="overflow-hidden"
        style={{ background: 'linear-gradient(160deg, #fff9f5 0%, #ffffff 50%, #f5f3ff 100%)' }}
      >
        <div className="container-site mx-auto max-w-3xl py-16 text-center md:py-20">
          <span className="badge-orange mb-4 inline-block">Gia nhập đội ngũ</span>
          <h1 className="text-text-dark mb-4 text-3xl font-black leading-tight sm:text-4xl lg:text-5xl">
            Cùng nhau{' '}
            <span className="text-gradient-orange-purple">truyền cảm hứng</span> cho thế hệ tiếp
            theo
          </h1>
          <p className="text-text-muted mx-auto mb-8 max-w-2xl text-lg">
            Sata Robo là nơi những người đam mê công nghệ và giáo dục cùng nhau xây dựng tương
            lai STEM cho trẻ em Việt Nam.
          </p>
          <div className="text-text-muted flex flex-wrap justify-center gap-6 text-sm font-semibold">
            <span className="flex items-center gap-2">
              <Heart className="h-4 w-4 text-[#F97316]" /> Văn hoá học hỏi liên tục
            </span>
            <span className="flex items-center gap-2">
              <Heart className="h-4 w-4 text-[#F97316]" /> Đội ngũ trẻ, nhiệt huyết
            </span>
            <span className="flex items-center gap-2">
              <Heart className="h-4 w-4 text-[#F97316]" /> Tác động thực tế đến học sinh
            </span>
          </div>
        </div>
      </section>

      {/* Filters + Job list */}
      <section className="section-padding bg-white">
        <div className="container-site mx-auto max-w-5xl">
          <div className="mb-8 flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-2xl font-black text-gray-900">Vị trí đang tuyển</h2>
              <p className="mt-1 text-sm text-gray-500">
                {jobs.length} vị trí{hasFilters ? ' (đã lọc)' : ' đang mở'}
              </p>
            </div>
            <JobFilters currentFilters={sp} />
          </div>

          {jobs.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-gray-200 py-16 text-center">
              <p className="text-gray-400">Không có vị trí phù hợp với bộ lọc hiện tại.</p>
              <a href="/tuyen-dung" className="mt-3 inline-block text-sm font-semibold text-[#7C3AED] hover:underline">
                Xem tất cả vị trí →
              </a>
            </div>
          ) : (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {jobs.map((job) => (
                <JobCard key={job.id} job={job} />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Speculative CTA */}
      <section
        className="section-padding"
        style={{ background: 'linear-gradient(135deg, #fff3e8 0%, #f5f3ff 100%)' }}
      >
        <div className="container-site mx-auto max-w-2xl text-center">
          <h2 className="text-text-dark mb-4 text-2xl font-black sm:text-3xl">
            Không thấy vị trí phù hợp?
          </h2>
          <p className="text-text-muted mb-6">
            Hãy gửi CV và portfolio tới HR của chúng tôi. Nếu bạn xuất sắc, chúng tôi sẽ tạo ra
            vị trí dành riêng cho bạn.
          </p>
          <a
            href={`mailto:${HR_CONTACT.email}`}
            className="btn-primary inline-flex items-center gap-2"
          >
            Gửi CV cho HR — {HR_CONTACT.name}
          </a>
          <p className="text-text-muted mt-3 text-sm">
            {HR_CONTACT.email} · {HR_CONTACT.phone}
          </p>
        </div>
      </section>
    </>
  )
}
