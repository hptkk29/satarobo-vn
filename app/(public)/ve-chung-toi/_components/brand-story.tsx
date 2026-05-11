import Image from 'next/image'

export function BrandStory() {
  return (
    <section className="section-padding bg-white">
      <div className="container-site">
        <div className="grid md:grid-cols-2 gap-12 lg:gap-16 items-start">
          {/* Text — trái */}
          <div className="flex flex-col gap-6">
            <div>
              <span className="badge-purple mb-3 inline-block">Câu chuyện thương hiệu</span>
              <h2 className="heading-2 text-text-dark">
                Từ lớp học nhỏ đến{' '}
                <span className="text-gradient-orange-purple">hệ sinh thái STEM</span>
              </h2>
            </div>

            {/*
              ANH CẦN CUNG CẤP TEXT THẬT — 4-5 đoạn câu chuyện thương hiệu.
              Placeholder dưới đây chỉ để giữ layout.
            */}
            <div className="space-y-4 text-text-muted leading-relaxed">
              <p>
                Năm 2020, trong bối cảnh Robotics & STEM bắt đầu được đưa vào chương trình giáo dục
                phổ thông, một nhóm nhỏ những người đam mê kỹ thuật tại Đà Nẵng đã nhìn thấy một
                cơ hội lớn: mang tri thức công nghệ đến tay học sinh ngay từ bậc tiểu học.
              </p>
              <p>
                {/* ANH CẦN CUNG CẤP NỘI DUNG THẬT — câu chuyện khởi đầu, thách thức đầu tiên */}
                [Đoạn 2 — ANH CẦN CUNG CẤP: Kể về giai đoạn đầu thành lập, cơ sở đầu tiên, những
                khó khăn và bước đột phá đầu tiên của Sata Robo]
              </p>
              <p>
                {/* ANH CẦN CUNG CẤP NỘI DUNG THẬT — mốc phát triển quan trọng */}
                [Đoạn 3 — ANH CẦN CUNG CẤP: Câu chuyện mở rộng 4 cơ sở, phát triển đội ngũ, học
                viên đầu tiên đạt thành tích tại các cuộc thi Robotics cấp quốc gia]
              </p>
              <p>
                {/* ANH CẦN CUNG CẤP NỘI DUNG THẬT — định hướng tương lai */}
                [Đoạn 4 — ANH CẦN CUNG CẤP: Hành trình số hoá sản phẩm (RoboSim Master), mở rộng
                B2B với Sata Inno School và du lịch giáo dục SATAGO]
              </p>
            </div>

            {/* Pull quote */}
            <blockquote className="border-l-4 border-primary-orange pl-5 py-2 bg-soft-cream rounded-r-xl">
              <p className="text-base sm:text-lg font-semibold text-text-dark italic leading-relaxed">
                {/* ANH CẦN CUNG CẤP — 1 câu trích dẫn key từ CEO hoặc câu slogan thương hiệu */}
                &ldquo;[ANH CẦN CUNG CẤP — Câu trích dẫn key của CEO Hồ Đắc Phúc về tầm nhìn
                Sata Robo]&rdquo;
              </p>
              <cite className="block mt-2 text-sm text-text-muted not-italic font-semibold">
                — Hồ Đắc Phúc, CEO &amp; Người sáng lập Sata Robo
              </cite>
            </blockquote>
          </div>

          {/* Image — phải */}
          {/*
            ANH CẦN CUNG CẤP ẢNH THẬT:
            Đặt ảnh tại /public/images/about/story.jpg
            Gợi ý: ảnh hoạt động học viên, ảnh trong lớp học, hoặc ảnh đội ngũ giảng dạy
            Kích thước: 600×700px, portrait
          */}
          <div className="relative rounded-3xl overflow-hidden h-[380px] md:h-[520px] bg-gradient-to-br from-purple-100 to-orange-50 flex items-center justify-center order-first md:order-last">
            <Image
              src="/images/about/story.jpg"
              alt="Hoạt động học Robotics tại Sata Robo"
              fill
              className="object-cover"
            />
            <div className="relative z-10 text-center text-gray-400 select-none pointer-events-none">
              <div className="text-sm font-semibold opacity-40">Ảnh hoạt động học viên</div>
              <div className="text-xs opacity-30 mt-1">ANH CẦN CUNG CẤP ẢNH THẬT</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
