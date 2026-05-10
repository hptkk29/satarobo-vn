import { MapPin, MessageCircle, Star } from 'lucide-react'
import { locations } from '../_data/locations'

export function Locations() {
  return (
    <section id="locations" className="section-padding bg-white">
      <div className="container-site">
        <div className="text-center mb-10 sm:mb-14 max-w-3xl mx-auto">
          <div className="badge-purple mb-4">
            <MapPin className="w-4 h-4" />
            ĐỊA ĐIỂM HỌC
          </div>
          <h2 className="heading-2 mb-4">
            <span className="text-gradient-orange-purple">4 ĐỊA CHỈ HỌC TẠI ĐÀ NẴNG</span>
            <br />
            <span className="text-text-dark text-2xl sm:text-3xl">— CHỌN GẦN NHÀ NHẤT</span>
          </h2>
          <p className="text-base sm:text-lg text-text-muted">
            Bố mẹ chọn trung tâm gần nhà — con không tốn thời gian di chuyển,
            bố mẹ đưa đón thuận tiện hơn.
          </p>
        </div>

        {/* Mobile: 2×2 grid — Desktop: 4 cols */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-10">
          {locations.map(loc => (
            <div
              key={loc.id}
              className={`card-base p-3 sm:p-4 border-2 transition flex flex-col ${
                loc.isHQ ? 'border-primary-orange' : 'border-gray-200'
              }`}
            >
              <div className="flex items-center justify-between gap-2 mb-2 sm:mb-3">
                <div
                  className={`w-8 h-8 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                    loc.isHQ
                      ? 'bg-primary-orange text-white'
                      : 'bg-soft-purple text-primary-purple'
                  }`}
                >
                  <MapPin className="w-4 h-4 sm:w-5 sm:h-5" />
                </div>
                {loc.isHQ && (
                  <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-primary-orange text-white text-[9px] sm:text-xs font-bold rounded-full">
                    <Star className="w-2.5 h-2.5 fill-current" />
                    <span className="hidden sm:inline">Trụ sở</span>
                    <span className="sm:hidden">HQ</span>
                  </span>
                )}
              </div>

              <h3 className="font-extrabold text-[11px] sm:text-base text-text-dark leading-snug mb-1 sm:mb-2 flex-1">
                {loc.address}
              </h3>
              {loc.note && (
                <p className="text-[10px] sm:text-sm text-primary-purple mb-2 sm:mb-4 hidden sm:block">
                  {loc.note}
                </p>
              )}

              <a
                href="#registration-form"
                className="w-full py-2 sm:py-2.5 bg-primary-orange/10 text-primary-orange font-bold text-[11px] sm:text-sm rounded-lg hover:bg-primary-orange hover:text-white transition inline-flex items-center justify-center gap-1 sm:gap-2 mt-auto"
              >
                <span className="hidden sm:inline">Chọn địa chỉ này</span>
                <span className="sm:hidden">Chọn</span>
              </a>
            </div>
          ))}
        </div>

        {/* Tip */}
        <div className="max-w-3xl mx-auto bg-soft-purple rounded-2xl p-5 text-center border-2 border-primary-purple/20">
          <p className="text-sm sm:text-base text-text-dark mb-3">
            💡 <strong>Bố mẹ chưa chắc trung tâm nào thuận tiện?</strong>
          </p>
          <p className="text-xs sm:text-sm text-text-muted mb-4">
            Inbox Zalo — Sata Robo gợi ý trung tâm gần nhà nhất theo địa chỉ bố mẹ cho.
          </p>
          <a
            href="https://zalo.me/0818823720"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary-purple text-white font-bold text-sm rounded-lg hover:bg-primary-purple-dark transition"
          >
            <MessageCircle className="w-4 h-4" />
            Chat Zalo gợi ý trung tâm
          </a>
        </div>
      </div>
    </section>
  )
}
