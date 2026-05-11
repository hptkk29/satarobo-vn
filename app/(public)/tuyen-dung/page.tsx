import type { Metadata } from 'next'
import Link from 'next/link'
import { MapPin, Clock, Briefcase, ChevronRight, Heart } from 'lucide-react'
import { breadcrumbJsonLd, organizationJsonLd } from '@/lib/seo/jsonld'

const BASE_URL = 'https://satarobo.vn'

export const metadata: Metadata = {
  title: 'Tuyển dụng — Sata Robo',
  description: 'Sata Robo tuyển dụng giáo viên Robotics, nhân viên Sales và Marketing tại Đà Nẵng. Môi trường năng động, đam mê giáo dục công nghệ.',
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

interface Job {
  id: string
  title: string
  department: string
  type: 'Toàn thời gian' | 'Bán thời gian' | 'Thực tập'
  location: string
  level: string
  description: string
  requirements: string[]
  benefits: string[]
}

const JOBS: Job[] = [
  {
    id: 'giao-vien-robotics',
    title: 'Giáo viên Robotics & Lập trình',
    department: 'Đào tạo',
    type: 'Toàn thời gian',
    location: 'Đà Nẵng (nhiều cơ sở)',
    level: 'Junior – Senior',
    description: 'Trực tiếp giảng dạy các khoá Lập trình Robot và luyện thi RoboSim cho học sinh lớp 1-8. Tham gia nghiên cứu phát triển giáo trình mới.',
    requirements: [
      'Tốt nghiệp ĐH ngành Kỹ thuật, CNTT, Cơ điện tử hoặc liên quan',
      'Đam mê giáo dục và làm việc với trẻ em',
      'Có kiến thức lập trình (Scratch, Python, C++ là lợi thế)',
      'Ưu tiên: đã từng thi đấu Robotics hoặc có chứng chỉ liên quan',
    ],
    benefits: ['Lương 8-15 triệu/tháng (theo năng lực)', 'Được đào tạo chuyên sâu trước khi đứng lớp', 'Cơ hội phát triển thành GV Lead / Trưởng bộ môn'],
  },
  {
    id: 'tu-van-tuyen-sinh',
    title: 'Tư vấn Tuyển sinh (Sales)',
    department: 'Kinh doanh',
    type: 'Toàn thời gian',
    location: 'Đà Nẵng',
    level: 'Junior',
    description: 'Tư vấn phụ huynh về các khoá học Robotics & STEM. Chăm sóc lead từ hệ thống CRM và chuyển đổi thành học viên đăng ký.',
    requirements: [
      'Tốt nghiệp ĐH/CĐ (ưu tiên ngành Kinh doanh, Marketing, Sư phạm)',
      'Giao tiếp tốt, thân thiện, kiên nhẫn',
      'Có kinh nghiệm tư vấn/bán hàng là lợi thế',
      'Yêu trẻ em và hiểu tâm lý phụ huynh',
    ],
    benefits: ['Lương cứng 6-8 triệu + hoa hồng không giới hạn', 'Thưởng KPI hàng tháng', 'Môi trường trẻ, năng động'],
  },
  {
    id: 'marketing-content',
    title: 'Marketing & Content Creator',
    department: 'Marketing',
    type: 'Toàn thời gian',
    location: 'Đà Nẵng',
    level: 'Junior – Mid',
    description: 'Sản xuất nội dung (blog, video, social media) về Robotics & STEM. Chạy quảng cáo Facebook/TikTok và phân tích hiệu quả chiến dịch.',
    requirements: [
      'Tốt nghiệp ĐH ngành Marketing, Truyền thông hoặc liên quan',
      'Biết viết bài blog SEO, thiết kế cơ bản (Canva/Figma)',
      'Có kinh nghiệm chạy Facebook Ads là lợi thế',
      'Đam mê nội dung, có khiếu kể chuyện',
    ],
    benefits: ['Lương 7-12 triệu/tháng', 'Được đầu tư thiết bị quay chụp', 'Tự chủ trong sáng tạo nội dung'],
  },
  {
    id: 'thuc-tap-sinh-robotics',
    title: 'Thực tập sinh Robotics',
    department: 'Đào tạo',
    type: 'Thực tập',
    location: 'Đà Nẵng',
    level: 'Intern',
    description: 'Hỗ trợ giáo viên trong các buổi học, tham gia chuẩn bị giáo cụ và tổ chức các hoạt động ngoại khoá STEM.',
    requirements: [
      'Sinh viên năm 3-4 ngành Kỹ thuật, CNTT, Sư phạm',
      'Nhiệt tình, chịu khó học hỏi',
      'Có thể đi làm ít nhất 3 buổi/tuần',
    ],
    benefits: ['Phụ cấp 2-3 triệu/tháng', 'Cơ hội trở thành nhân viên chính thức', 'Kinh nghiệm thực tiễn quý báu'],
  },
]

const TYPE_COLORS: Record<string, string> = {
  'Toàn thời gian': 'bg-green-100 text-green-700',
  'Bán thời gian': 'bg-blue-100 text-blue-700',
  'Thực tập': 'bg-orange-100 text-orange-700',
}

export default function TuyenDungPage() {
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
            ])
          ),
        }}
      />

      {/* Hero */}
      <section
        className="overflow-hidden"
        style={{ background: 'linear-gradient(160deg, #fff9f5 0%, #ffffff 50%, #f5f3ff 100%)' }}
      >
        <div className="container-site py-16 md:py-20 text-center max-w-3xl mx-auto">
          <span className="badge-orange mb-4 inline-block">Gia nhập đội ngũ</span>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black leading-tight text-text-dark mb-4">
            Cùng nhau{' '}
            <span className="text-gradient-orange-purple">truyền cảm hứng</span>
            {' '}cho thế hệ tiếp theo
          </h1>
          <p className="text-lg text-text-muted mb-8 max-w-2xl mx-auto">
            Sata Robo là nơi những người đam mê công nghệ và giáo dục cùng nhau xây dựng tương lai STEM cho trẻ em Việt Nam.
          </p>
          <div className="flex flex-wrap gap-6 justify-center text-sm font-semibold text-text-muted">
            <span className="flex items-center gap-2"><Heart className="w-4 h-4 text-primary-orange" /> Văn hoá học hỏi liên tục</span>
            <span className="flex items-center gap-2"><Heart className="w-4 h-4 text-primary-orange" /> Đội ngũ trẻ, nhiệt huyết</span>
            <span className="flex items-center gap-2"><Heart className="w-4 h-4 text-primary-orange" /> Tác động thực tế đến học sinh</span>
          </div>
        </div>
      </section>

      {/* Job listings */}
      <section className="section-padding bg-white">
        <div className="container-site max-w-4xl mx-auto">
          <h2 className="heading-2 mb-8 text-center">
            Vị trí đang tuyển dụng
          </h2>

          <div className="space-y-5">
            {JOBS.map((job) => (
              <div key={job.id} className="card-base p-6 group hover:border-primary-orange/40 transition">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${TYPE_COLORS[job.type] ?? 'bg-gray-100 text-gray-600'}`}>
                        {job.type}
                      </span>
                      <span className="text-xs text-text-muted font-medium">{job.department}</span>
                    </div>
                    <h3 className="text-xl font-extrabold text-text-dark mb-1">{job.title}</h3>
                    <div className="flex flex-wrap gap-4 text-sm text-text-muted mb-3">
                      <span className="flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5" />{job.location}</span>
                      <span className="flex items-center gap-1.5"><Briefcase className="w-3.5 h-3.5" />{job.level}</span>
                      <span className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" />{job.type}</span>
                    </div>
                    <p className="text-sm text-text-muted leading-relaxed">{job.description}</p>

                    {/* Requirements */}
                    <div className="mt-4">
                      <p className="text-xs font-bold uppercase tracking-wider text-text-dark mb-2">Yêu cầu</p>
                      <ul className="space-y-1">
                        {job.requirements.map((req, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm text-text-muted">
                            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary-orange" />
                            {req}
                          </li>
                        ))}
                      </ul>
                    </div>

                    {/* Benefits */}
                    <div className="mt-3">
                      <p className="text-xs font-bold uppercase tracking-wider text-text-dark mb-2">Quyền lợi</p>
                      <ul className="space-y-1">
                        {job.benefits.map((b, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm text-text-muted">
                            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary-purple" />
                            {b}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  <div className="sm:shrink-0">
                    <Link
                      href={`/lien-he?subject=tuyen-dung&job=${job.id}`}
                      className="inline-flex items-center gap-2 rounded-xl bg-primary-orange px-5 py-2.5 text-sm font-bold text-white hover:opacity-90 transition whitespace-nowrap"
                    >
                      Ứng tuyển ngay
                      <ChevronRight className="w-4 h-4" />
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="section-padding" style={{ background: 'linear-gradient(135deg, #fff3e8 0%, #f5f3ff 100%)' }}>
        <div className="container-site text-center max-w-2xl mx-auto">
          <h2 className="text-2xl sm:text-3xl font-black text-text-dark mb-4">
            Không thấy vị trí phù hợp?
          </h2>
          <p className="text-text-muted mb-6">
            Hãy gửi CV và portfolio tới HR của chúng tôi. Nếu bạn xuất sắc, chúng tôi sẽ tạo ra vị trí dành riêng cho bạn.
          </p>
          <a
            href="mailto:mytrangduong1986@gmail.com"
            className="btn-primary inline-flex items-center gap-2"
          >
            Gửi CV cho HR — Ms. Trang
          </a>
          <p className="mt-3 text-sm text-text-muted">mytrangduong1986@gmail.com · 0905 250 544</p>
        </div>
      </section>
    </>
  )
}
