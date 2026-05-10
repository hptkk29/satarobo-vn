import { MobileCarousel } from './mobile-carousel'

const CARDS = [
  {
    icon: '🏆',
    title: 'Giải thưởng lớn',
    body: 'Hàng chục triệu đồng và bằng khen cấp Trung ương Đoàn cho các đội xuất sắc nhất',
  },
  {
    icon: '💡',
    title: 'Định hướng tương lai công nghệ',
    body: 'Được tiếp cận sớm với lập trình và giải quyết vấn đề — nền tảng cho các ngành công nghệ trong tương lai.',
  },
  {
    icon: '🌍',
    title: 'Sân chơi quốc tế',
    body: 'Cơ hội đại diện Việt Nam tham dự WRC – World Robot Championship toàn cầu',
  },
  {
    icon: '🧠',
    title: 'Kỹ năng thế kỷ 21',
    body: 'Rèn tư duy logic, kỹ năng lập trình và giải quyết vấn đề – nền tảng STEM vững chắc',
  },
  {
    icon: '🤖',
    title: 'Thi trực tuyến qua RoboSim',
    body: 'Vòng loại thi qua phần mềm RoboSim – học sinh luyện bài bản sẽ có lợi thế vượt trội',
  },
  {
    icon: '⏰',
    title: 'Hạn đăng ký 19/07/2026',
    body: 'Cần ít nhất 4–6 tuần chuẩn bị – bắt đầu học ngay hôm nay để không bị động',
  },
]

const SLIDES = [CARDS.slice(0, 3), CARDS.slice(3, 6)]

function Card({ card }: { card: (typeof CARDS)[number] }) {
  return (
    <article className="bg-white/90 border border-primary-purple/14 rounded-2xl p-7 text-center shadow-lg transition-all duration-200 hover:border-primary-orange/35 hover:bg-white hover:shadow-orange-glow hover:-translate-y-0.5">
      <span className="block text-[2rem] mb-3.5" aria-hidden>{card.icon}</span>
      <h3 className="text-[15px] font-bold text-text-dark mb-2.5 leading-snug">{card.title}</h3>
      <p className="text-sm text-text-muted leading-relaxed">{card.body}</p>
    </article>
  )
}

function MiniCard({ card }: { card: (typeof CARDS)[number] }) {
  return (
    <div className="bg-white/90 border border-primary-purple/16 rounded-2xl p-4 text-center flex flex-col items-center gap-2 min-h-[110px] justify-center">
      <span className="text-[1.6rem] leading-none" aria-hidden>{card.icon}</span>
      <p className="text-[11px] font-bold text-primary-purple-dark leading-snug m-0">{card.title}</p>
    </div>
  )
}

export function ContestInfo() {
  return (
    <section
      className="section-padding relative overflow-hidden"
      id="contest-info"
      aria-labelledby="contest-heading"
      style={{
        background: [
          'radial-gradient(circle at 12% 8%, rgba(249,115,22,0.16), transparent 28%)',
          'radial-gradient(circle at 88% 12%, rgba(124,58,237,0.14), transparent 30%)',
          'linear-gradient(180deg, #fff7ed 0%, #ffffff 48%, #faf5ff 100%)',
        ].join(', '),
      }}
    >
      <div className="container-site">
        <div className="text-center">
          <span className="inline-flex items-center gap-1.5 bg-white/80 border border-primary-orange/28 text-primary-purple shadow-sm text-[11px] font-bold tracking-[.6px] px-4 py-1.5 rounded-full uppercase mb-5">
            🏆 TẦM QUAN TRỌNG CỦA CUỘC THI
          </span>
        </div>

        <h2
          id="contest-heading"
          className="text-[clamp(26px,4.5vw,42px)] font-extrabold leading-tight text-gray-900 mb-3 text-center"
        >
          Cuộc thi Sáng tạo Robotics 2026
          <br />
          <span className="text-gradient-orange-purple">Cơ hội vàng không thể bỏ lỡ</span>
        </h2>

        <p className="text-text-muted text-base max-w-2xl mx-auto mb-12 text-center">
          Do Trung ương Đoàn TNCS Hồ Chí Minh tổ chức — uy tín quốc gia, tầm vóc quốc tế
        </p>

        {/* Desktop grid */}
        <div className="hidden sm:grid grid-cols-2 md:grid-cols-3 gap-5 mb-10">
          {CARDS.map(card => (
            <Card key={card.title} card={card} />
          ))}
        </div>

        {/* Mobile carousel */}
        <div className="sm:hidden mb-8">
          <MobileCarousel autoInterval={3200} accentColor="#c084fc">
            {SLIDES.map((group, i) => (
              <div key={i} className="grid grid-cols-3 gap-2 p-1">
                {group.map(card => (
                  <MiniCard key={card.title} card={card} />
                ))}
              </div>
            ))}
          </MobileCarousel>
        </div>

        <div className="text-center mt-8">
          <a
            href="https://drive.google.com/file/d/1fE3ALCboUanJlLxFb6Uq7iiJqYu7y4mC/view?usp=sharing"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl text-white font-bold text-[15px] no-underline transition-all duration-200 hover:-translate-y-0.5 sm:text-sm sm:px-6 sm:py-3.5"
            style={{
              background: 'linear-gradient(135deg, #f97316 0%, #fb923c 44%, #7c3aed 100%)',
              boxShadow: '0 18px 42px rgba(249,115,22,0.24)',
            }}
          >
            📋 Xem thể lệ cuộc thi Sáng tạo Robotics 2026 →
          </a>
        </div>
      </div>
    </section>
  )
}
