import Link from 'next/link'

const PRODUCTS = [
  {
    code: 'SP1',
    icon: '🖥️',
    name: 'Luyện thi RoboSim Online',
    desc: 'Khoá video luyện thi vòng loại Sáng tạo Robotics 2026. Bảng R1 (Tiểu học) và R2 (THCS). Học mọi lúc mọi nơi.',
    price: 'Từ 490.000đ',
    tag: 'Học Online',
    tagColor: 'bg-orange-100 text-orange-700',
    href: '/khoa-hoc/luyen-thi-robosim',
    cta: 'Xem khoá',
    highlight: true,
  },
  {
    code: 'SP2',
    icon: '🤖',
    name: 'Lập trình Robot Offline',
    desc: 'Học trực tiếp tại trung tâm — lộ trình 5 năm từ Robosim Master đến Vé Vàng Chung Kết. 4 cơ sở tại Đà Nẵng.',
    price: 'Từ 2.040.000đ',
    tag: 'Học Offline',
    tagColor: 'bg-purple-100 text-purple-700',
    href: '/khoa-hoc/lap-trinh-robot',
    cta: 'Xem lộ trình',
    highlight: false,
  },
  {
    code: 'SP3',
    icon: '🏫',
    name: 'Sata Inno School',
    desc: 'Giải pháp Robotics & STEM toàn diện cho trường học — chương trình, thiết bị, đào tạo giáo viên.',
    price: 'Liên hệ báo giá',
    tag: 'B2B',
    tagColor: 'bg-blue-100 text-blue-700',
    href: '/lien-he',
    cta: 'Liên hệ ngay',
    highlight: false,
  },
  {
    code: 'SP4',
    icon: '✈️',
    name: 'SATAGO Du lịch giáo dục',
    desc: 'Trải nghiệm học STEM qua các chuyến đi giáo dục — kết hợp du lịch khám phá và công nghệ thực tiễn.',
    price: 'Xem lịch trình',
    tag: 'Trải nghiệm',
    tagColor: 'bg-green-100 text-green-700',
    href: '/lien-he',
    cta: 'Tìm hiểu thêm',
    highlight: false,
  },
]

export function Products() {
  return (
    <section
      id="san-pham"
      aria-labelledby="products-heading"
      className="section-padding bg-white"
    >
      <div className="container-site">
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 rounded-full border border-orange-200 bg-orange-50 px-4 py-1.5 mb-4">
            <span className="text-primary-orange text-xs font-black uppercase tracking-wider">
              4 Dòng sản phẩm
            </span>
          </div>
          <h2
            id="products-heading"
            className="text-2xl sm:text-3xl lg:text-4xl font-black text-text-dark leading-tight"
          >
            Giải pháp cho mọi nhu cầu STEM
          </h2>
          <p className="mt-3 text-text-muted text-sm sm:text-base max-w-xl mx-auto">
            Từ luyện thi online đến học offline, từ cá nhân đến trường học — Sata Robo có giải pháp phù hợp
          </p>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {PRODUCTS.map((p) => (
            <div
              key={p.code}
              className={`flex flex-col rounded-3xl border p-6 transition hover:-translate-y-1 hover:shadow-lg ${
                p.highlight
                  ? 'border-primary-orange/30 bg-gradient-to-br from-orange-50 to-white shadow-md'
                  : 'border-gray-100 bg-white shadow-sm'
              }`}
            >
              <div className="text-4xl mb-4" aria-hidden="true">{p.icon}</div>
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold mb-3 w-fit ${p.tagColor}`}
              >
                {p.tag}
              </span>
              <h3 className="text-base font-black text-text-dark mb-2">{p.name}</h3>
              <p className="text-sm text-text-muted leading-relaxed flex-1">{p.desc}</p>
              <div className="mt-4 mb-3 text-lg font-extrabold text-primary-orange">{p.price}</div>
              <Link
                href={p.href}
                className={`inline-flex items-center justify-center rounded-xl py-2.5 px-4 text-sm font-bold transition ${
                  p.highlight
                    ? 'bg-primary-orange text-white hover:bg-orange-600'
                    : 'border border-gray-200 text-text-dark hover:border-primary-orange hover:text-primary-orange'
                }`}
              >
                {p.cta} →
              </Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
