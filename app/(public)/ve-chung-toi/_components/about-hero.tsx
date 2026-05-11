import Image from 'next/image'

export function AboutHero() {
  return (
    <section
      className="overflow-hidden w-full"
      style={{ background: 'linear-gradient(160deg, #fff9f5 0%, #ffffff 50%, #f5f3ff 100%)' }}
    >
      <div className="container-site py-16 md:py-20 grid md:grid-cols-2 gap-10 items-center">
        {/* Text */}
        <div className="flex flex-col gap-5">
          <span className="badge-orange w-fit">Về Sata Robo</span>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black leading-tight text-text-dark">
            Câu chuyện{' '}
            <span className="text-gradient-orange-purple">Sata Robo</span>
          </h1>
          <p className="text-lg sm:text-xl text-text-muted leading-relaxed">
            Từ một ý tưởng nhỏ đến hệ sinh thái Robotics &amp; STEM hàng đầu Đà Nẵng
          </p>
          <div className="flex gap-6 flex-wrap">
            <div className="text-center">
              <div className="text-2xl font-black text-primary-orange">2020</div>
              <div className="text-xs text-text-muted">Năm thành lập</div>
            </div>
            <div className="w-px bg-border self-stretch" />
            <div className="text-center">
              <div className="text-2xl font-black text-primary-orange">4</div>
              <div className="text-xs text-text-muted">Cơ sở Đà Nẵng</div>
            </div>
            <div className="w-px bg-border self-stretch" />
            <div className="text-center">
              <div className="text-2xl font-black text-primary-orange">1.000+</div>
              <div className="text-xs text-text-muted">Học viên</div>
            </div>
          </div>
        </div>

        {/*
          ANH CẦN CUNG CẤP ẢNH THẬT:
          Đặt ảnh team hoặc trụ sở tại /public/images/about/hero.jpg
          Kích thước đề xuất: 800×500px, landscape
        */}
        <div className="relative rounded-3xl overflow-hidden h-[280px] md:h-[380px] bg-gradient-to-br from-orange-100 to-purple-100 flex items-center justify-center">
          <Image
            src="/images/about/hero.jpg"
            alt="Đội ngũ Sata Robo tại trụ sở Đà Nẵng"
            fill
            className="object-cover"
            priority
          />
          {/* Placeholder hiển thị khi ảnh chưa có */}
          <div className="relative z-10 text-center text-gray-400 select-none pointer-events-none">
            <div className="text-4xl mb-2 opacity-25">&#9679;</div>
            <div className="text-sm font-semibold opacity-40">Ảnh đội ngũ / trụ sở</div>
            <div className="text-xs opacity-30 mt-1">ANH CẦN CUNG CẤP ẢNH THẬT</div>
          </div>
        </div>
      </div>
    </section>
  )
}
