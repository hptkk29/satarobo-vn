const USPS = [
  {
    icon: '🏆',
    title: 'Thành tích thực chứng',
    desc: '100% học viên tại Sata Robo đã PASS vòng loại. Nhiều em đã đại diện Việt Nam thi đấu quốc tế.',
  },
  {
    icon: '📚',
    title: 'Lộ trình chuẩn quốc tế',
    desc: 'Từ Robosim cơ bản đến robot Beta nâng cao — lộ trình 5 năm chuẩn hóa theo tiêu chuẩn WRO.',
  },
  {
    icon: '👨‍🏫',
    title: 'Đội ngũ giáo viên chuyên nghiệp',
    desc: 'Giáo viên có kinh nghiệm thi đấu quốc tế, được đào tạo bài bản và tận tâm với từng học viên.',
  },
  {
    icon: '💯',
    title: 'Cam kết hoàn 100% học phí',
    desc: 'Không hài lòng sau buổi đầu? Sata Robo hoàn 100% học phí — không hỏi lý do.',
  },
]

export function WhySata() {
  return (
    <section
      aria-labelledby="why-sata-heading"
      className="section-padding"
      style={{ background: 'linear-gradient(160deg, #0f0529 0%, #1a0845 60%, #0d0420 100%)' }}
    >
      <div className="container-site">
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 mb-4">
            <span className="text-white/80 text-xs font-black uppercase tracking-wider">
              Tại sao chọn Sata Robo?
            </span>
          </div>
          <h2
            id="why-sata-heading"
            className="text-2xl sm:text-3xl lg:text-4xl font-black text-white leading-tight"
          >
            Đầu tư có cam kết —{' '}
            <span className="text-gradient-orange-purple">kết quả thực chứng</span>
          </h2>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {USPS.map((u) => (
            <div
              key={u.title}
              className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm"
            >
              <div className="text-4xl mb-4" aria-hidden="true">{u.icon}</div>
              <h3 className="text-base font-black text-white mb-2">{u.title}</h3>
              <p className="text-sm text-white/70 leading-relaxed">{u.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
