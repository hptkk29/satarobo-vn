export function HocCuHero() {
  return (
    <section
      className="overflow-hidden w-full"
      style={{ background: 'linear-gradient(160deg, #fff9f5 0%, #ffffff 50%, #f5f3ff 100%)' }}
    >
      <div className="container-site py-14 md:py-18 text-center max-w-3xl mx-auto">
        <span className="badge-orange mb-4 inline-block">Học cụ chính hãng</span>
        <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black leading-tight text-text-dark mb-4">
          Bộ học cụ{' '}
          <span className="text-gradient-orange-purple">chính hãng Sata Robo</span>
        </h1>
        <p className="text-lg sm:text-xl text-text-muted leading-relaxed">
          Học cụ thiết kế riêng cho từng độ tuổi — đồng bộ hoàn toàn với chương trình giảng dạy,
          đảm bảo trải nghiệm học tập hiệu quả nhất.
        </p>
      </div>
    </section>
  )
}
