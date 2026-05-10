import Image from 'next/image'

const compareRows = [
  {
    feature: 'Người hướng dẫn',
    free: 'Tự mò trên Youtube — không có thầy chỉ',
    course: 'Giảng viên chỉ MẸO + TRICK chuyên môn',
  },
  {
    feature: 'Kết quả học',
    free: 'Cùng cách làm như đa số → cùng kết quả như đa số',
    course: 'Cách làm khác đa số → kết quả khác đa số',
  },
  {
    feature: 'Vị trí thi',
    free: 'Đứng chung vạch với hàng nghìn bạn khác',
    course: 'Vượt lên trước — vào nhóm TOP đi tiếp',
  },
  {
    feature: 'Kết quả thi',
    free: 'BTC cắt top — đa số rơi vào nhóm BỊ LOẠI',
    course: 'PASS vòng loại — bước vào sân chơi khu vực',
  },
]

const points = [
  {
    icon: '⚙️',
    strong: 'CÁCH DI CHUYỂN robot NHANH nhất, CHÍNH XÁC nhất.',
    rest: ' (Mỗi giây tiết kiệm = thêm 1 điểm có thể ăn được.)',
  },
  {
    icon: '🎯',
    strong: 'TRICK + MẸO không có trên Youtube — không có ở khoá free.',
    rest: ' (Đây là kỹ thuật giảng viên tích luỹ qua nhiều mùa thi.)',
  },
  {
    icon: '📋',
    strong: 'HƯỚNG DẪN từng bước trong video — con xem 1 lần là làm được.',
    rest: ' (Không cần bố mẹ kèm. Không cần thầy cô đứng cạnh.)',
  },
  {
    icon: '⏱️',
    strong: 'RÈN PHẢN XẠ trong RoboSim —',
    rest: ' đến phòng thi 180 phút, con chỉ cần LẶP LẠI thao tác đã quen tay.',
  },
]

export function Solution() {
  return (
    <section id="solution" aria-labelledby="solution-heading" className="section-padding bg-white">
      <div className="container-site">
        <div className="text-center mb-10 sm:mb-14 max-w-3xl mx-auto">
          <h2 id="solution-heading" className="heading-2 mb-4">
            ĐÂY LÀ LÝ DO PHỤ HUYNH TINH Ý
            <br />
            <span className="text-gradient-orange-purple">CHỌN KHOÁ LUYỆN THI ROBOSIM CHO CON</span>
          </h2>
          <p className="text-base sm:text-lg text-text-muted">
            Bố mẹ không cần biết kỹ thuật.
            <br />
            Chỉ cần biết: con đang ở đâu — và sau khoá học, con sẽ ở đâu.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-10 sm:gap-14 items-center mb-12">
          <div>
            <h3 className="text-lg sm:text-xl font-bold text-text-dark mb-4">
              🤖 Khoá Luyện Thi không chỉ giải đề. Khoá Luyện Thi{' '}
              <em className="not-italic text-primary-orange">GIẢI TỐI ƯU</em>.
            </h3>
            <p className="text-sm sm:text-base text-text-muted mb-5 leading-relaxed">
              Cùng 1 đề thi vòng loại RBT2026. Cùng 180 phút. Cùng phần mềm RoboSim.
              <br />
              Khác biệt nằm ở <strong>4 điều — chỉ giảng viên chuyên môn mới có:</strong>
            </p>
            <ul className="space-y-4" role="list">
              {points.map((p, i) => (
                <li key={i} className="flex gap-3 items-start" role="listitem">
                  <span className="text-xl mt-0.5 shrink-0" aria-hidden="true">{p.icon}</span>
                  <div className="text-sm sm:text-base text-text-muted leading-relaxed">
                    <strong className="text-text-dark">{p.strong}</strong>
                    {p.rest}
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <div className="relative rounded-2xl overflow-hidden shadow-xl border border-gray-100">
            <Image
              src="/images/courses/luyen-thi-robosim/demo-robosim.png"
              alt="Sa bàn RoboSim — giao diện phần mềm thi vòng loại RBT2026"
              width={1912}
              height={989}
              className="w-full h-auto"
              loading="lazy"
            />
          </div>
        </div>

        <div>
          <h3 className="text-sm font-extrabold text-center text-primary-purple mb-5">
            📊 Khác biệt giữa "tự luyện free" và "học khoá luyện thi":
          </h3>

          <div className="rounded-2xl overflow-hidden shadow-md border border-purple-100">
            <div className="grid grid-cols-2">
              <div className="bg-gradient-to-br from-red-50 to-yellow-50 p-3 text-center border-r border-white/60">
                <span className="text-lg">❌</span>
                <div className="text-xs font-extrabold text-red-700 mt-1 uppercase tracking-wide">Học Free</div>
              </div>
              <div className="bg-gradient-to-br from-green-50 to-purple-50 p-3 text-center">
                <span className="text-lg">✅</span>
                <div className="text-xs font-extrabold text-green-800 mt-1 uppercase tracking-wide">Học Khoá Luyện Thi</div>
              </div>
            </div>

            {compareRows.map((row, i) => (
              <div key={i}>
                <div className={`px-4 py-2 border-t border-purple-50 ${i % 2 === 0 ? 'bg-purple-50/40' : 'bg-gray-50'}`}>
                  <span className="text-xs font-extrabold text-primary-purple uppercase tracking-wide">{row.feature}</span>
                </div>
                <div className={`grid grid-cols-2 ${i % 2 === 0 ? 'bg-purple-50/40' : 'bg-gray-50'}`}>
                  <div className="px-4 py-3 border-r border-purple-50 text-xs text-purple-800/70 leading-relaxed bg-red-50/20">
                    {row.free}
                  </div>
                  <div className="px-4 py-3 text-xs font-semibold text-green-900 leading-relaxed bg-green-50/25">
                    {row.course}
                  </div>
                </div>
              </div>
            ))}

            <div
              className="grid grid-cols-2 gap-3 p-4"
              style={{ background: 'linear-gradient(135deg, #5B2D8E, #7C3AED)' }}
            >
              <div className="text-center text-white/70 text-xs font-bold">😔 Đứng cùng đám đông</div>
              <div className="text-center text-white text-xs font-extrabold">🏆 VƯỢT LÊN — PASS!</div>
            </div>
          </div>

          <p className="text-center text-sm mt-6 text-text-muted">
            👉 Con bố mẹ ở bảng nào?{' '}
            <a href="#courses" className="text-primary-purple font-semibold hover:underline">
              Xem chi tiết khoá học bên dưới ↓
            </a>
          </p>
        </div>
      </div>
    </section>
  )
}
