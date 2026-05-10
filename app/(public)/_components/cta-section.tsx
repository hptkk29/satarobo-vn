import { CtaForm } from './cta-form'

export function CtaSection() {
  return (
    <section
      id="dang-ky-tu-van"
      aria-labelledby="cta-heading"
      className="section-padding"
      style={{ background: 'linear-gradient(160deg, #0f0529 0%, #1a0845 60%, #0d0420 100%)' }}
    >
      <div className="container-site">
        <div className="grid md:grid-cols-2 gap-10 items-center">
          {/* Left: value props */}
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 mb-5">
              <span className="text-white/80 text-xs font-black uppercase tracking-wider">
                Đăng ký tư vấn miễn phí
              </span>
            </div>
            <h2
              id="cta-heading"
              className="text-2xl sm:text-3xl lg:text-4xl font-black text-white leading-tight mb-5"
            >
              Nhận tư vấn ngay —{' '}
              <span className="text-primary-orange">trong 30 phút</span>
            </h2>
            <ul className="flex flex-col gap-3 text-sm text-white/80 mb-8">
              {[
                '✅ Tư vấn lộ trình phù hợp với độ tuổi và mục tiêu của con',
                '✅ Giải đáp mọi thắc mắc về khoá học và thi đấu Robotics',
                '✅ Không ép mua — tư vấn hoàn toàn miễn phí',
                '✅ Cam kết hoàn 100% học phí nếu không hài lòng sau buổi đầu',
              ].map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <div className="flex flex-wrap items-center gap-3">
              <a
                href="https://zalo.me/0818823720"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-xl bg-[#0068FF] px-5 py-3 text-sm font-bold text-white transition hover:scale-105 active:scale-95"
              >
                💬 Chat Zalo ngay
              </a>
              <a
                href="tel:0818823720"
                className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-5 py-3 text-sm font-bold text-white transition hover:bg-white/20"
              >
                📞 0818.823.720
              </a>
            </div>
          </div>

          {/* Right: form */}
          <div className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
            <CtaForm />
          </div>
        </div>
      </div>
    </section>
  )
}
