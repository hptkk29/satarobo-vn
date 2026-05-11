import { Phone, Mail, MapPin } from 'lucide-react'

const INFO_CARDS = [
  {
    icon: Phone,
    label: 'Hotline',
    value: '0818.823.720',
    href: 'tel:0818823720',
    color: '#F97316',
    bg: '#FFF7ED',
  },
  {
    icon: Mail,
    label: 'Email',
    value: 'satarobo@gmail.com',
    href: 'mailto:satarobo@gmail.com',
    color: '#7C3AED',
    bg: '#F3E8FF',
  },
  {
    icon: MapPin,
    label: 'Trụ sở chính',
    value: '258 Lê Thanh Nghị, Hoà Cường, Đà Nẵng',
    href: 'https://www.google.com/maps/search/?api=1&query=258+L%C3%AA+Thanh+Ngh%E1%BB%8B%2C+H%C3%B2a+C%C6%B0%E1%BB%9Dng%2C+%C4%90%C3%A0+N%E1%BA%B5ng',
    color: '#059669',
    bg: '#ECFDF5',
  },
]

export function ContactInfo() {
  return (
    <section className="section-padding bg-white">
      <div className="container-site">
        <div className="grid sm:grid-cols-3 gap-5">
          {INFO_CARDS.map((card) => (
            <a
              key={card.label}
              href={card.href}
              target={card.label === 'Trụ sở chính' ? '_blank' : undefined}
              rel={card.label === 'Trụ sở chính' ? 'noopener noreferrer' : undefined}
              className="card-base p-6 flex gap-4 items-start hover:-translate-y-1 transition-transform group"
            >
              <div
                className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0"
                style={{ background: card.bg }}
              >
                <card.icon className="w-6 h-6" style={{ color: card.color }} />
              </div>
              <div>
                <div className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-1">
                  {card.label}
                </div>
                <div
                  className="font-bold text-text-dark group-hover:underline leading-snug"
                  style={{ color: card.color }}
                >
                  {card.value}
                </div>
              </div>
            </a>
          ))}
        </div>
      </div>
    </section>
  )
}
