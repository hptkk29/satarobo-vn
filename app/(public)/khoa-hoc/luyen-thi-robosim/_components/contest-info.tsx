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

export function ContestInfo() {
  return (
    <section
      id="contest-info"
      aria-labelledby="contest-heading"
      className="section-padding"
      style={{
        background: 'linear-gradient(160deg, #0f0529 0%, #1a0845 50%, #0a1535 100%)',
        color: '#fff',
      }}
    >
      <div className="container-site">
        <div className="text-center mb-4">
          <span className="inline-flex items-center gap-1.5 bg-purple-900/30 border border-purple-500/40 text-purple-300 text-xs font-bold tracking-wide px-4 py-1.5 rounded-full uppercase">
            🏆 Tầm quan trọng của cuộc thi
          </span>
        </div>

        <h2
          id="contest-heading"
          className="text-center text-3xl sm:text-4xl font-extrabold leading-snug mb-3 text-white"
        >
          Cuộc thi Sáng tạo Robotics 2026
          <br />
          <span
            style={{
              background: 'linear-gradient(135deg, #c084fc 0%, #a855f7 50%, #7c3aed 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}
          >
            Cơ hội vàng không thể bỏ lỡ
          </span>
        </h2>

        <p className="text-center text-white/60 text-base max-w-xl mx-auto mb-12">
          Do Trung ương Đoàn TNCS Hồ Chí Minh tổ chức — uy tín quốc gia, tầm vóc quốc tế
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 sm:gap-5 mb-10">
          {CARDS.map((card) => (
            <article
              key={card.title}
              className="bg-white/5 border border-purple-500/20 rounded-2xl p-6 text-center hover:border-purple-500/50 hover:bg-purple-500/10 transition"
            >
              <span className="block text-3xl mb-3" aria-hidden="true">{card.icon}</span>
              <h3 className="text-sm font-bold text-white mb-2 leading-snug">{card.title}</h3>
              <p className="text-xs text-white/60 leading-relaxed">{card.body}</p>
            </article>
          ))}
        </div>

        <div className="text-center">
          <a
            href="https://drive.google.com/drive/folders/12DTFji_NWDg_i3d1SGgjKKp8vxjF1seL?usp=drive_link"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-8 py-3.5 rounded-xl border-2 border-teal-400 text-teal-400 font-bold text-sm hover:bg-teal-400/10 transition"
          >
            📋 Xem thể lệ cuộc thi Sáng tạo Robotics 2026 đầy đủ →
          </a>
        </div>
      </div>
    </section>
  )
}
