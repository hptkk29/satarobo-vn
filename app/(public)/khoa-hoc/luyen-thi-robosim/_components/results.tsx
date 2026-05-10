'use client'

import Image from 'next/image'
import { trackAndOpen } from '../_utils/track-cta'

const scores = [
  {
    level: 'R1' as const,
    badge: '🟦 KẾT QUẢ BẢNG R1 — TIỂU HỌC',
    imgSrc: '/images/courses/luyen-thi-robosim/r1-result.jpg',
    imgAlt: 'Kết quả 781/800 điểm Bảng R1 — Học viên Sata Robo giải tối ưu đề vòng loại RBT2026',
    imgW: 2000,
    imgH: 1125,
    score: '781 / 800 điểm',
    ctaText: '🟦 ĐĂNG KÝ BẢNG R1 — 490.000đ',
    ctaSub: '(Cho con TIỂU HỌC)',
    eventName: 'section6_R1',
    borderColor: '#2563EB',
    badgeBg: '#EFF6FF',
    badgeText: '#1d4ed8',
    btnStyle: { background: 'linear-gradient(135deg, #2563EB, #3b82f6)', color: '#fff' },
  },
  {
    level: 'R2' as const,
    badge: '🟪 KẾT QUẢ BẢNG R2 — THCS',
    imgSrc: '/images/courses/luyen-thi-robosim/r2-result.jpg',
    imgAlt: 'Kết quả 856/900 điểm Bảng R2 — Học viên Sata Robo giải tối ưu đề vòng loại RBT2026',
    imgW: 2559,
    imgH: 1515,
    score: '856 / 900 điểm',
    ctaText: '🟪 ĐĂNG KÝ BẢNG R2 — 490.000đ',
    ctaSub: '(Cho con THCS)',
    eventName: 'section6_R2',
    borderColor: '#7C3AED',
    badgeBg: '#F5F3FF',
    badgeText: '#6d28d9',
    btnStyle: { background: 'linear-gradient(135deg, #7C3AED, #a78bfa)', color: '#fff' },
  },
]

export function Results() {
  return (
    <section
      id="results"
      aria-labelledby="results-heading"
      className="section-padding bg-soft-cream"
    >
      <div className="container-site">
        <div className="text-center mb-10 sm:mb-14 max-w-3xl mx-auto">
          <h2 id="results-heading" className="heading-2 mb-4">
            KẾT QUẢ CÁC THÍ SINH ĐÃ THAM GIA KHOÁ LUYỆN THI
          </h2>
          <p className="text-base sm:text-lg text-text-muted">
            Đây là điểm số <strong>THẬT</strong> — chụp từ phần mềm RoboSim
            <br />
            khi giải tối ưu đề thi vòng loại RBT2026 theo đúng kỹ thuật mà Sata Robo dạy trong khoá Luyện Thi.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 gap-6 sm:gap-8 max-w-4xl mx-auto">
          {scores.map((s) => (
            <article
              key={s.level}
              className="card-base overflow-hidden"
              style={{ borderColor: `${s.borderColor}40` }}
              aria-label={`${s.badge}: ${s.score}`}
            >
              <div
                className="px-4 py-2.5 text-xs font-extrabold tracking-wide"
                style={{ background: s.badgeBg, color: s.badgeText }}
              >
                {s.badge}
              </div>

              <div className="relative w-full" style={{ aspectRatio: `${s.imgW} / ${s.imgH}` }}>
                <Image
                  src={s.imgSrc}
                  alt={s.imgAlt}
                  fill
                  className="object-cover"
                  loading="lazy"
                  unoptimized
                />
              </div>

              <div className="p-5 text-center">
                <div
                  className="text-2xl sm:text-3xl font-black mb-4"
                  style={{ color: s.borderColor }}
                >
                  {s.score}
                </div>
                <button
                  onClick={() => trackAndOpen(s.level, s.eventName)}
                  className="w-full rounded-xl py-3.5 px-4 font-extrabold text-sm leading-snug transition hover:opacity-90 hover:-translate-y-0.5"
                  style={s.btnStyle}
                  aria-label={`${s.ctaText} ${s.ctaSub} — mở trong tab mới`}
                >
                  {s.ctaText}
                  <span className="block text-xs font-bold opacity-80 mt-0.5">{s.ctaSub}</span>
                </button>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}
