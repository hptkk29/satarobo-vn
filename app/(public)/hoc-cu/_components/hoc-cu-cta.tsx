import { Phone } from 'lucide-react'

export function HocCuCta() {
  return (
    <section className="section-padding bg-white">
      <div className="container-site">
        <div
          className="rounded-3xl px-8 py-10 flex flex-col sm:flex-row items-center justify-between gap-6"
          style={{ background: 'linear-gradient(135deg, #FFF7ED 0%, #F3E8FF 100%)' }}
        >
          <div>
            <h2 className="text-xl sm:text-2xl font-extrabold text-text-dark">
              Cần tư vấn chọn bộ học cụ phù hợp?
            </h2>
            <p className="text-text-muted mt-1">
              Chuyên viên Sata Robo sẽ giúp anh/chị chọn đúng sản phẩm theo độ tuổi và cấp độ
              của con.
            </p>
          </div>
          <a
            href="tel:0818823720"
            className="inline-flex items-center gap-3 px-7 py-4 rounded-2xl text-white font-extrabold text-lg whitespace-nowrap transition hover:opacity-90 hover:-translate-y-0.5 flex-shrink-0"
            style={{
              background: 'linear-gradient(135deg, #F97316, #FBBF24)',
              boxShadow: '0 8px 24px rgba(249,115,22,0.4)',
            }}
          >
            <Phone className="w-5 h-5" />
            0818.823.720
          </a>
        </div>
      </div>
    </section>
  )
}
