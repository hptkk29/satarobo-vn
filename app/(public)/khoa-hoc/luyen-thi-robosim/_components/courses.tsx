'use client'

import Image from 'next/image'
import { courses } from '../_data/courses'
import { trackAndOpen } from '../_utils/track-cta'

const colorMap = {
  r1: {
    border: '#2563EB',
    badgeBg: '#EFF6FF',
    badgeText: '#1d4ed8',
    checkColor: '#2563EB',
    btnStyle: { background: 'linear-gradient(135deg, #2563EB, #3b82f6)', color: '#fff' },
    discountBg: '#dbeafe',
    discountText: '#1d4ed8',
  },
  r2: {
    border: '#7C3AED',
    badgeBg: '#F5F3FF',
    badgeText: '#6d28d9',
    checkColor: '#7C3AED',
    btnStyle: { background: 'linear-gradient(135deg, #7C3AED, #a78bfa)', color: '#fff' },
    discountBg: '#ede9fe',
    discountText: '#5b21b6',
  },
}

export function Courses() {
  return (
    <section id="courses" aria-labelledby="courses-heading" className="section-padding bg-soft-cream">
      <div className="container-site">
        <div className="text-center mb-10 sm:mb-14 max-w-3xl mx-auto">
          <h2 id="courses-heading" className="heading-2 mb-4">
            KHOÁ LUYỆN THI ROBOSIM —
            <br />
            <span className="text-gradient-orange-purple">TIỂU HỌC CHỌN R1, THCS CHỌN R2</span>
          </h2>
          <p className="text-base sm:text-lg text-text-muted">
            Sata Robo có 2 nội dung khoá luyện thi — tương ứng 2 bảng thi vòng loại RBT2026.
            <br />
            Bố mẹ chọn theo lứa tuổi của con. Đơn giản vậy thôi.
          </p>

          <div
            role="note"
            className="mt-4 inline-block px-4 py-2 rounded-full text-sm font-semibold text-yellow-800 bg-yellow-50 border border-yellow-200"
          >
            💡 Lỡ chọn nhầm bảng? Sata Robo hỗ trợ đổi khoá miễn phí.
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-6 sm:gap-8 max-w-4xl mx-auto mb-12">
          {courses.map((course) => {
            const c = colorMap[course.colorKey]
            return (
              <article
                key={course.id}
                className="card-base p-6 sm:p-8"
                style={{ borderColor: `${c.border}40` }}
                aria-label={`${course.title} — ${course.subtitle}`}
              >
                <span
                  className="inline-block text-xs font-extrabold px-3 py-1 rounded-full mb-3"
                  style={{ background: c.badgeBg, color: c.badgeText }}
                >
                  {course.badge}
                </span>
                <h3 className="font-extrabold text-lg sm:text-xl text-text-dark mb-1">{course.title}</h3>
                <p className="text-sm font-semibold mb-4" style={{ color: c.border }}>{course.tagline}</p>

                <ul className="space-y-2 mb-4 text-sm text-text-muted">
                  <li><span className="mr-2">👤</span><strong>Dành cho:</strong> {course.audience}</li>
                  <li><span className="mr-2">📋</span><strong>Bảng đề thi:</strong> {course.examBoard}</li>
                  <li><span className="mr-2">⏰</span><strong>Thời lượng:</strong> {course.duration}</li>
                </ul>

                <div className="mb-4">
                  <p className="text-xs font-bold text-text-dark mb-1">🎯 Đầu ra:</p>
                  <ul className="space-y-1">
                    {course.outcomes.map((o) => (
                      <li key={o} className="text-sm text-text-muted flex items-center gap-1.5">
                        <span className="font-bold" style={{ color: c.checkColor }}>✓</span> {o}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="mb-4">
                  <div className="text-sm line-through text-gray-400 mb-0.5">{course.originalPrice}</div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-2xl font-black text-text-dark">{course.salePrice}</span>
                    <span
                      className="text-xs font-extrabold px-2.5 py-1 rounded-full"
                      style={{ background: c.discountBg, color: c.discountText }}
                    >
                      🔥 {course.discount}
                    </span>
                  </div>
                </div>

                <ul className="space-y-1.5 mb-5">
                  {course.features.map((f) => (
                    <li key={f} className="flex items-center gap-2 text-sm text-text-muted">
                      <span className="font-bold" style={{ color: c.checkColor }}>✓</span> {f}
                    </li>
                  ))}
                </ul>

                <button
                  onClick={() => trackAndOpen(course.level, `section4_${course.level}`)}
                  className="w-full rounded-xl py-3.5 px-4 font-extrabold text-sm leading-snug transition hover:opacity-90 hover:-translate-y-0.5"
                  style={c.btnStyle}
                  aria-label={`${course.ctaText} — mở trong tab mới`}
                >
                  {course.ctaText}
                </button>
              </article>
            )
          })}
        </div>

        {/* Deal closer */}
        <div className="max-w-3xl mx-auto card-base p-6 sm:p-8 mb-8">
          <h3 className="font-extrabold text-base sm:text-lg text-text-dark mb-3">🔥 Mình nói thẳng với bố mẹ:</h3>
          <p className="text-sm sm:text-base text-text-muted mb-2">
            ❌ Không học khoá luyện thi → Con đứng chung vạch với cả nước → Bị loại.
          </p>
          <p className="text-sm sm:text-base text-text-muted mb-6">
            ✅ Học khoá luyện thi 490k → Con biết MẸO + TRICK → Vượt lên trước →{' '}
            <strong className="text-green-700">PASS</strong>.
          </p>

          {/* VS widget */}
          <div
            className="grid grid-cols-[1fr_auto_1fr] gap-4 items-center bg-gray-50 rounded-2xl p-5"
            aria-label="So sánh chi phí: 10 cốc trà sữa vs Khoá học Sata Robo"
          >
            <div className="text-center">
              <div className="flex flex-wrap justify-center gap-1 mb-2" aria-hidden="true">
                {Array.from({ length: 10 }).map((_, i) => (
                  <span key={i} className="text-xl">🧋</span>
                ))}
              </div>
              <p className="text-xs font-bold text-text-dark mb-0.5">Mua 10 cốc trà sữa</p>
              <p className="text-base font-black text-gray-700">450.000đ</p>
              <p className="text-xs text-text-muted">Uống xong là hết — không còn lại gì</p>
            </div>

            <div className="flex items-center justify-center">
              <span className="text-sm font-black text-white bg-primary-purple rounded-full w-9 h-9 flex items-center justify-center shadow-md">
                VS
              </span>
            </div>

            <div className="text-center">
              <div className="flex justify-center mb-2">
                <Image
                  src="/images/courses/luyen-thi-robosim/linh-vat.png"
                  alt="Linh vật Sata Robo"
                  width={64}
                  height={64}
                  className="object-contain"
                />
              </div>
              <p className="text-xs font-bold text-text-dark mb-0.5">Khoá học Sata Robo</p>
              <p className="text-base font-black text-primary-orange">490.000đ</p>
              <p className="text-xs text-text-muted">18 buổi học · Truy cập vĩnh viễn</p>
              <p className="text-xs text-text-muted">Cơ hội vào vòng chung kết quốc gia</p>
            </div>
          </div>

          <p className="text-center text-sm font-bold text-text-dark mt-4">Bố mẹ thấy đáng không?</p>
        </div>

        {/* Support */}
        <div className="text-center">
          <p className="text-sm text-text-muted mb-1">💡 Bố mẹ phân vân con thuộc bảng nào?</p>
          <p className="text-sm text-text-muted mb-4">
            Inbox mình ngay — gửi tên lớp con đang học, tư vấn miễn phí trong 10 phút.
          </p>
          <a
            href="https://zalo.me/0818823720"
            target="_blank"
            rel="noopener noreferrer"
            className="btn-primary"
            aria-label="Chat Zalo với Sata Robo để được tư vấn miễn phí"
          >
            💬 Chat Zalo với mình →
          </a>
        </div>
      </div>
    </section>
  )
}
