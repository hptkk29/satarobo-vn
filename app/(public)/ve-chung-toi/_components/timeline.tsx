interface Milestone {
  year: string
  title: string
  description: string
  badge?: string
}

const MILESTONES: Milestone[] = [
  {
    year: '2020',
    title: 'Thành lập Sata Robo',
    description:
      'Sata Robo ra đời với sứ mệnh mang Robotics đến gần hơn với học sinh Đà Nẵng. Lớp học đầu tiên mở tại trụ sở 258 Lê Thanh Nghị, Hoà Cường.',
  },
  {
    year: '2021',
    title: 'Khai trương cơ sở đầu tiên',
    description:
      'Cơ sở 258 Lê Thanh Nghị chính thức đi vào hoạt động. Đây là nền tảng để Sata Robo mở rộng mô hình ra nhiều quận huyện Đà Nẵng.',
  },
  {
    year: '2022–2024',
    title: 'Mở rộng lên 4 cơ sở Đà Nẵng',
    description:
      // ANH CẦN CUNG CẤP — mô tả chi tiết quá trình mở rộng 4 cơ sở, địa chỉ cụ thể
      '[ANH CẦN CUNG CẤP — Kể về quá trình mở rộng từ 1 lên 4 cơ sở tại các quận của Đà Nẵng, số học viên tích lũy và thành tích đạt được trong giai đoạn này]',
    badge: 'Bước ngoặt',
  },
  {
    year: '2025',
    title: 'Ra mắt khoá Luyện thi RoboSim online',
    description:
      '[ANH CẦN CUNG CẤP — Mô tả chi tiết việc ra mắt khoá Luyện thi RoboSim trên platform mô phỏng đầu tiên tại Việt Nam, kết quả ban đầu]',
    badge: 'Số hoá',
  },
  {
    year: '2026',
    title: 'Tập trung 2 khoá học chủ lực & Thi TW Đoàn lần 6',
    description:
      '[ANH CẦN CUNG CẤP — Hành trình học viên Sata Robo tham dự cuộc thi Robotics toàn quốc lần 6 và mở rộng 2 khoá học chủ lực Lập trình Robot + Luyện thi RoboSim]',
    badge: 'Hiện tại',
  },
]

export function Timeline() {
  return (
    <section className="section-padding bg-white">
      <div className="container-site">
        <div className="text-center mb-12">
          <span className="badge-purple mb-3 inline-block">Hành trình</span>
          <h2 className="heading-2 text-text-dark">
            Các mốc{' '}
            <span className="text-gradient-orange-purple">phát triển</span>
          </h2>
          <p className="text-text-muted mt-3">
            6 năm xây dựng và phát triển — từng bước vươn ra tầm quốc gia
          </p>
        </div>

        {/*
          ANH CẦN CUNG CẤP:
          - Nội dung chi tiết cho từng mốc (đặc biệt 2022–2026)
          - Ảnh nhỏ minh hoạ cho từng mốc (optional):
            /public/images/about/timeline/2020.jpg, 2021.jpg, 2022.jpg, 2025.jpg, 2026.jpg
        */}
        <div className="relative max-w-3xl mx-auto">
          {/* Đường dọc */}
          <div className="absolute left-6 top-3 bottom-3 w-0.5 bg-gradient-to-b from-primary-orange via-primary-purple to-primary-orange opacity-20" />

          <div className="space-y-10 pl-16">
            {MILESTONES.map((m, i) => (
              <div key={m.year} className="relative">
                {/* Dot on timeline */}
                <div
                  className="absolute -left-[2.75rem] top-1 w-4 h-4 rounded-full border-2 border-white"
                  style={{
                    background: i % 2 === 0 ? '#F97316' : '#7C3AED',
                    boxShadow: `0 0 0 4px ${i % 2 === 0 ? '#FFF7ED' : '#F3E8FF'}`,
                  }}
                />

                <div className="card-base p-6">
                  <div className="flex items-center gap-3 mb-3 flex-wrap">
                    <span
                      className="text-sm font-black px-3 py-1 rounded-full text-white"
                      style={{
                        background: i % 2 === 0 ? '#F97316' : '#7C3AED',
                      }}
                    >
                      {m.year}
                    </span>
                    {m.badge && (
                      <span className="text-xs font-bold px-2 py-0.5 rounded-full border border-current text-primary-purple">
                        {m.badge}
                      </span>
                    )}
                  </div>
                  <h3 className="text-base font-extrabold text-text-dark mb-2">{m.title}</h3>
                  <p className="text-sm text-text-muted leading-relaxed">{m.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
