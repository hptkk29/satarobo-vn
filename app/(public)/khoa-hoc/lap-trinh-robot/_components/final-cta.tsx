import { ArrowRight, MapPin, MessageCircle, Phone, Star } from 'lucide-react'

const stats = [
  { label: 'Học sinh đã học', value: '500+' },
  { label: 'Cơ sở tại Đà Nẵng', value: '4' },
  { label: 'Năm kinh nghiệm', value: '5+' },
  { label: 'Tỷ lệ vào chung kết', value: '89%' },
]

const contacts = [
  {
    icon: Phone,
    label: 'Hotline',
    value: '0818.823.720',
    href: 'tel:0818823720',
    description: 'T2-T7, 8:00–20:00',
    external: false,
  },
  {
    icon: MessageCircle,
    label: 'Zalo',
    value: 'Chat ngay',
    href: 'https://zalo.me/0818823720',
    description: 'Phản hồi trong 5 phút',
    external: true,
  },
  {
    icon: MapPin,
    label: 'Cơ sở',
    value: '4 địa điểm',
    href: '#locations',
    description: 'Khắp thành phố Đà Nẵng',
    external: false,
  },
]

export function FinalCTA() {
  return (
    <section
      id="final-cta"
      className="relative overflow-hidden bg-gradient-to-br from-primary-orange via-primary-orange to-primary-orange-dark py-12 sm:py-16 lg:py-20"
    >
      {/* Decorative blobs */}
      <div className="pointer-events-none absolute inset-0 opacity-10" aria-hidden="true">
        <div className="absolute -left-16 -top-16 h-64 w-64 rounded-full bg-white" />
        <div className="absolute -bottom-24 -right-16 h-80 w-80 rounded-full bg-white" />
      </div>

      <div className="container-site relative">
        <div className="mb-10 text-center sm:mb-12">
          <div className="mb-4 inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1 text-xs font-bold uppercase tracking-wider text-white">
            <Star className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
            SẴN SÀNG BẮT ĐẦU?
          </div>
          <h2 className="heading-2 mb-4 text-white">
            Đăng ký hôm nay — nhận ưu đãi khai trương
          </h2>
          <p className="mx-auto max-w-xl text-base text-white/90 sm:text-lg">
            Sata Robo gọi lại xác nhận trong 30 phút. Không bắt buộc đóng tiền ngay.
          </p>
        </div>

        {/* Stats */}
        <div className="mb-10 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {stats.map(stat => (
            <div
              key={stat.label}
              className="rounded-2xl bg-white/15 p-4 text-center backdrop-blur-sm"
            >
              <div className="text-2xl font-black text-white sm:text-3xl">{stat.value}</div>
              <div className="mt-1 text-xs text-white/80 sm:text-sm">{stat.label}</div>
            </div>
          ))}
        </div>

        {/* CTA buttons */}
        <div className="mb-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <a
            href="#registration-form"
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-white px-8 py-4 font-bold text-primary-orange shadow-lg transition hover:scale-105 hover:bg-white/90 active:scale-95 sm:w-auto"
          >
            Đăng ký ngay — nhận ưu đãi
            <ArrowRight className="h-5 w-5" aria-hidden="true" />
          </a>
          <a
            href="https://zalo.me/0818823720"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl border-2 border-white/60 bg-transparent px-8 py-4 font-bold text-white transition hover:bg-white/20 sm:w-auto"
          >
            <MessageCircle className="h-5 w-5" aria-hidden="true" />
            Tư vấn qua Zalo
          </a>
        </div>

        {/* Contact grid */}
        <div className="grid gap-3 sm:grid-cols-3">
          {contacts.map(contact => {
            const Icon = contact.icon
            return (
              <a
                key={contact.label}
                href={contact.href}
                target={contact.external ? '_blank' : undefined}
                rel={contact.external ? 'noopener noreferrer' : undefined}
                className="flex items-center gap-3 rounded-2xl bg-white/15 p-4 backdrop-blur-sm transition hover:bg-white/25"
              >
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-white/25">
                  <Icon className="h-5 w-5 text-white" aria-hidden="true" />
                </div>
                <div>
                  <div className="text-xs font-semibold text-white/70">{contact.label}</div>
                  <div className="font-bold text-white">{contact.value}</div>
                  <div className="text-xs text-white/70">{contact.description}</div>
                </div>
              </a>
            )
          })}
        </div>
      </div>
    </section>
  )
}
