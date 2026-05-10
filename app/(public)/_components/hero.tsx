import Link from 'next/link'
import Image from 'next/image'

const TRUST_STATS = [
  { value: '1.000+', label: 'Học viên' },
  { value: '4', label: 'Cơ sở Đà Nẵng' },
  { value: '5+', label: 'Năm kinh nghiệm' },
  { value: '98%', label: 'Phụ huynh hài lòng' },
]

export function Hero() {
  return (
    <section
      id="hero"
      aria-labelledby="hero-heading"
      className="overflow-hidden w-full"
      style={{ background: 'linear-gradient(160deg, #fff9f5 0%, #ffffff 50%, #f5f3ff 100%)' }}
    >
      <div className="container-site grid md:grid-cols-2 gap-10 items-center py-12 md:py-16">
        {/* Left */}
        <div className="flex flex-col gap-5">
          <span
            className="inline-flex items-center gap-2 text-white text-xs font-bold px-4 py-2 rounded-full w-fit"
            style={{
              background: 'linear-gradient(135deg, #F97316, #FBBF24)',
              boxShadow: '0 4px 16px rgba(249,115,22,0.35)',
            }}
          >
            🏆 Trung tâm Robotics & STEM hàng đầu Đà Nẵng
          </span>

          <h1
            id="hero-heading"
            className="text-3xl sm:text-4xl lg:text-5xl font-black leading-tight text-text-dark"
          >
            Từ vòng loại đến{' '}
            <span className="text-gradient-orange-purple">chung kết thế giới</span>
            <br />
            hành trình bắt đầu từ đây
          </h1>

          <p className="text-base sm:text-lg text-text-muted leading-relaxed">
            Sata Robo trang bị cho con nền tảng Robotics & STEM vững chắc — từ luyện thi vòng loại đến đại diện Việt Nam chinh phục đấu trường quốc tế.
          </p>

          {/* Trust strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {TRUST_STATS.map((s) => (
              <div
                key={s.label}
                className="rounded-2xl border border-gray-100 bg-white p-3 text-center shadow-sm"
              >
                <div className="text-xl font-black text-primary-orange">{s.value}</div>
                <div className="text-xs text-text-muted mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>

          <div className="flex gap-3 flex-wrap">
            <Link
              href="/khoa-hoc"
              className="flex-1 min-w-[160px] rounded-2xl py-4 px-5 font-extrabold text-base text-white text-center transition hover:opacity-90 hover:-translate-y-0.5"
              style={{
                background: 'linear-gradient(135deg, #F97316, #FBBF24)',
                boxShadow: '0 8px 24px rgba(249,115,22,0.4)',
              }}
            >
              Xem khoá học
            </Link>
            <Link
              href="#dang-ky-tu-van"
              className="flex-1 min-w-[160px] rounded-2xl py-4 px-5 font-extrabold text-base text-center border-2 border-primary-purple text-primary-purple transition hover:bg-purple-50 hover:-translate-y-0.5"
            >
              Đăng ký tư vấn
            </Link>
          </div>

          <p className="text-sm text-text-muted">
            ⚡ Vòng loại Sáng tạo Robotics 2026 —{' '}
            <strong className="text-primary-orange">ngày 26/07/2026</strong>. Còn thời gian chuẩn bị!
          </p>
        </div>

        {/* Right: mascot */}
        <div className="relative flex items-center justify-center min-h-[280px] sm:min-h-[380px]">
          <div
            className="absolute inset-0 rounded-full pointer-events-none"
            style={{
              background:
                'radial-gradient(ellipse at 55% 55%, #ffd6a5 0%, #e9d5ff 55%, transparent 80%)',
              filter: 'blur(48px)',
              opacity: 0.7,
            }}
          />
          <Image
            src="/images/courses/lap-trinh-robot/LinhVat.png"
            alt="Linh vật Sata Robo"
            width={400}
            height={400}
            className="relative z-10 w-full max-w-[280px] sm:max-w-[360px] object-contain"
            style={{ filter: 'drop-shadow(0 24px 48px rgba(124,58,237,0.28))' }}
            priority
          />

          {/* Floating card — contest date */}
          <div
            className="absolute top-[15%] -left-2 sm:-left-4 z-10 bg-white rounded-2xl shadow-xl border border-orange-100 px-4 py-2.5"
            style={{ animation: 'float 3.5s ease-in-out infinite' }}
          >
            <div className="text-xs text-gray-400 font-semibold">📅 Vòng loại RBT2026</div>
            <div className="text-base font-extrabold text-primary-orange">26/07/2026</div>
          </div>

          {/* Floating card — achievement */}
          <div
            className="absolute bottom-[15%] -right-2 sm:-right-4 z-10 bg-white rounded-2xl shadow-xl border border-purple-100 px-4 py-2.5"
            style={{ animation: 'float 4s ease-in-out infinite 0.8s' }}
          >
            <div className="text-xs text-gray-400 font-semibold">🏆 Học viên Sata Robo</div>
            <div className="text-sm font-extrabold text-primary-purple">Chinh phục đấu trường Quốc tế</div>
          </div>
        </div>
      </div>
    </section>
  )
}
