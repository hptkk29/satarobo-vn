import Image from 'next/image'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { CheckCircle, ArrowRight } from 'lucide-react'

interface CourseCard {
  id: string
  badge: string[]
  title: string
  tagline: string
  image: string
  imageAlt: string
  bullets: string[]
  price: string
  ctaLabel: string
  ctaHref: string
  highlight: boolean
  priority: boolean
}

const COURSES: CourseCard[] = [
  {
    id: 'sp1',
    badge: ['ONLINE', 'MỚI'],
    title: 'SP1 — RoboSim Master',
    tagline: 'Luyện thi Robotics 100% online, học mọi lúc mọi nơi',
    // ANH CẦN CUNG CẤP ẢNH THẬT tại /public/images/courses/robosim-master.jpg
    image: '/images/courses/luyen-thi-robosim/OG_ROBOSIM_ONLINE.jpg',
    imageAlt: 'Khoá học RoboSim Master Online — Sata Robo',
    bullets: [
      '18 buổi video bài giảng chuyên sâu',
      'Sa bàn ảo mô phỏng robot thực tế',
      'AI chấm bài tự động, phản hồi tức thì',
      'R1 Tiểu học (lớp 3–6) & R2 THCS (lớp 6–9)',
      'Cam kết hoàn 100% học phí nếu không đạt',
    ],
    price: 'Từ 490.000đ',
    ctaLabel: 'Xem chi tiết',
    ctaHref: '/khoa-hoc/luyen-thi-robosim',
    highlight: true,
    priority: true,
  },
  {
    id: 'sp2',
    badge: ['OFFLINE', 'BESTSELLER'],
    title: 'SP2 — Lập trình Robot Offline',
    tagline: 'Lộ trình 5 năm bài bản, học cụ riêng, 4 cơ sở Đà Nẵng',
    // ANH CẦN CUNG CẤP ẢNH THẬT tại /public/images/courses/lap-trinh-robot.jpg
    image: '/images/courses/lap-trinh-robot/LinhVat.png',
    imageAlt: 'Khoá lập trình Robot Offline tại Sata Robo Đà Nẵng',
    bullets: [
      '4 cơ sở tại Đà Nẵng, lịch học linh hoạt',
      'Lộ trình 5 năm từ cơ bản đến nâng cao',
      'Đội ngũ giảng viên chuyên môn Robotics',
      'Bộ học cụ riêng, không chung lẫn',
      'Kết nối thi đấu cấp tỉnh và toàn quốc',
    ],
    price: 'Từ 1.990.000đ',
    ctaLabel: 'Xem chi tiết',
    ctaHref: '/khoa-hoc/lap-trinh-robot',
    highlight: false,
    priority: false,
  },
  {
    id: 'sp3',
    badge: ['B2B'],
    title: 'SP3 — Sata Inno School',
    tagline: 'Giải pháp Lab STEM toàn diện cho trường K-12',
    image: '/images/courses/sata-inno-school.jpg', // ANH CẦN CUNG CẤP ẢNH THẬT
    imageAlt: 'Sata Inno School — Giải pháp STEM B2B cho trường học',
    bullets: [
      'Trang bị Lab STEM hoàn chỉnh theo NQ57',
      'Đào tạo giáo viên, chuyển giao chương trình',
      'KPI Dashboard theo dõi tiến độ học sinh',
      'Kết nối Viện ITH và đối tác quốc tế',
      'Hỗ trợ thi đấu Robotics cấp trường, tỉnh',
    ],
    price: 'Báo giá theo dự án',
    ctaLabel: 'Liên hệ tư vấn',
    ctaHref: '/lien-he?subject=sata-inno-school',
    highlight: false,
    priority: false,
  },
  {
    id: 'sp4',
    badge: ['TRẢI NGHIỆM', 'MỚI'],
    title: 'SP4 — SATAGO',
    tagline: 'Du lịch giáo dục Robotics & STEM theo CT GDPT 2018',
    image: '/images/courses/satago.jpg', // ANH CẦN CUNG CẤP ẢNH THẬT
    imageAlt: 'SATAGO — Du lịch giáo dục Robotics & STEM',
    bullets: [
      'Tour 105 tiết theo chương trình GDPT 2018',
      'Kết hợp học tập thực địa và trải nghiệm STEM',
      'Dành cho trường K-12 và phụ huynh tổ chức nhóm',
      'Tích hợp hoạt động Robotics trong môi trường thực',
    ],
    price: 'Báo giá theo đoàn',
    ctaLabel: 'Tìm hiểu thêm',
    ctaHref: '/lien-he?subject=satago',
    highlight: false,
    priority: false,
  },
]

function CourseCardItem({ course }: { course: CourseCard }) {
  return (
    <div
      className={`card-base overflow-hidden flex flex-col ${
        course.highlight
          ? 'ring-2 ring-primary-orange shadow-orange-glow'
          : ''
      }`}
    >
      {/* Image */}
      <div className="relative h-52 bg-gradient-to-br from-orange-50 to-purple-50 overflow-hidden">
        <Image
          src={course.image}
          alt={course.imageAlt}
          fill
          className="object-cover"
          priority={course.priority}
        />
        {/* Badges */}
        <div className="absolute top-3 left-3 flex gap-1.5 flex-wrap">
          {course.badge.map((b) => (
            <Badge
              key={b}
              className={
                b === 'BESTSELLER'
                  ? 'bg-primary-orange text-white border-0 text-xs font-bold'
                  : b === 'MỚI' || b === 'TRẢI NGHIỆM'
                    ? 'bg-primary-purple text-white border-0 text-xs font-bold'
                    : b === 'B2B'
                      ? 'bg-gray-800 text-white border-0 text-xs font-bold'
                      : 'bg-white text-text-dark border border-gray-200 text-xs font-bold'
              }
            >
              {b}
            </Badge>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="p-6 flex flex-col gap-4 flex-1">
        <div>
          <h2 className="text-xl font-extrabold text-text-dark">{course.title}</h2>
          <p className="text-text-muted text-sm mt-1">{course.tagline}</p>
        </div>

        <ul className="space-y-2 flex-1">
          {course.bullets.map((b) => (
            <li key={b} className="flex items-start gap-2 text-sm text-text-muted">
              <CheckCircle className="w-4 h-4 text-primary-orange flex-shrink-0 mt-0.5" />
              <span>{b}</span>
            </li>
          ))}
        </ul>

        <div className="flex items-center justify-between mt-2 pt-4 border-t border-border">
          <div>
            <div className="text-xs text-text-muted">Học phí</div>
            <div className="font-extrabold text-primary-orange">{course.price}</div>
          </div>
          <Link
            href={course.ctaHref}
            className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition hover:-translate-y-0.5 ${
              course.highlight
                ? 'text-white'
                : 'bg-gray-100 text-text-dark hover:bg-gray-200'
            }`}
            style={
              course.highlight
                ? { background: 'linear-gradient(135deg, #F97316, #FBBF24)' }
                : {}
            }
          >
            {course.ctaLabel}
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </div>
  )
}

export function CourseCards() {
  return (
    <section className="section-padding bg-white">
      <div className="container-site">
        <div className="text-center mb-12">
          <span className="badge-orange mb-3 inline-block">4 sản phẩm</span>
          <h2 className="heading-2 text-text-dark">
            Chọn hình thức học{' '}
            <span className="text-gradient-orange-purple">phù hợp với con</span>
          </h2>
        </div>
        <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-6">
          {COURSES.map((course) => (
            <CourseCardItem key={course.id} course={course} />
          ))}
        </div>
      </div>
    </section>
  )
}
