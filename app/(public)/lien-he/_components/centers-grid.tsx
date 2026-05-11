import { Phone, Mail, Clock, ExternalLink } from 'lucide-react'
import { generateGoogleMapsUrl } from '@/lib/utils'

interface Center {
  id: string
  name: string
  address: string
  phone: string | null
  email: string | null
}

interface CentersGridProps {
  centers: Center[]
}

function CenterCard({ center }: { center: Center }) {
  const mapsUrl = generateGoogleMapsUrl(`${center.address}, Đà Nẵng, Việt Nam`)
  const embedUrl = `https://maps.google.com/maps?q=${encodeURIComponent(center.address + ', Đà Nẵng, Việt Nam')}&z=16&output=embed&hl=vi`

  return (
    <div className="card-base overflow-hidden">
      {/* Google Maps embed */}
      <div className="h-44 bg-gray-100 relative">
        <iframe
          src={embedUrl}
          width="100%"
          height="100%"
          style={{ border: 0 }}
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          title={`Bản đồ ${center.name}`}
          className="w-full h-full"
        />
      </div>

      {/* Content */}
      <div className="p-5 flex flex-col gap-3">
        <h3 className="font-extrabold text-text-dark">{center.name}</h3>

        <div className="space-y-2 text-sm">
          <div className="flex items-start gap-2 text-text-muted">
            <span className="text-primary-orange mt-0.5 flex-shrink-0">&#9679;</span>
            <span>{center.address}, Đà Nẵng</span>
          </div>

          {center.phone && (
            <a
              href={`tel:${center.phone.replace(/\D/g, '')}`}
              className="flex items-center gap-2 text-primary-orange font-semibold hover:underline"
            >
              <Phone className="w-4 h-4 flex-shrink-0" />
              {center.phone}
            </a>
          )}

          {center.email && (
            <a
              href={`mailto:${center.email}`}
              className="flex items-center gap-2 text-primary-purple font-semibold hover:underline"
            >
              <Mail className="w-4 h-4 flex-shrink-0" />
              {center.email}
            </a>
          )}

          <div className="flex items-center gap-2 text-text-muted">
            <Clock className="w-4 h-4 flex-shrink-0 text-text-muted" />
            <span>T2–CN: 8h00 – 21h00</span>
          </div>
        </div>

        <a
          href={mapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 mt-1 text-sm font-bold text-primary-purple hover:underline"
        >
          <ExternalLink className="w-4 h-4" />
          Chỉ đường
        </a>
      </div>
    </div>
  )
}

export function CentersGrid({ centers }: CentersGridProps) {
  return (
    <section
      className="section-padding"
      style={{ background: 'linear-gradient(160deg, #f5f3ff 0%, #ffffff 60%, #fff9f5 100%)' }}
    >
      <div className="container-site">
        <div className="text-center mb-12">
          <span className="badge-purple mb-3 inline-block">Hệ thống cơ sở</span>
          <h2 className="heading-2 text-text-dark">
            4 cơ sở{' '}
            <span className="text-gradient-orange-purple">tại Đà Nẵng</span>
          </h2>
          <p className="text-text-muted mt-3">
            Gần nhà, tiện học — đến trực tiếp hoặc gọi đặt lịch tư vấn miễn phí
          </p>
        </div>

        {centers.length === 0 ? (
          <p className="text-center text-text-muted py-12">
            Đang cập nhật thông tin cơ sở... Vui lòng gọi hotline{' '}
            <a href="tel:0818823720" className="font-bold text-primary-orange">
              0818.823.720
            </a>
          </p>
        ) : (
          <div className="grid sm:grid-cols-2 gap-6">
            {centers.map((center) => (
              <CenterCard key={center.id} center={center} />
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
