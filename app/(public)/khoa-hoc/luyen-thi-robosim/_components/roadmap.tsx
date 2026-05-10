'use client'

import { useState, useEffect, useRef } from 'react'
import { roadmap } from '../_data/roadmap'

const stageColors = {
  green: { bg: '#d1fae5', border: '#10b981', text: '#065f46' },
  yellow: { bg: '#fef9c3', border: '#f59e0b', text: '#78350f' },
  red: { bg: '#fee2e2', border: '#ef4444', text: '#991b1b' },
}

function StageCard({ stage }: { stage: typeof roadmap[0] }) {
  const colors = stageColors[stage.colorKey]
  return (
    <article
      className="card-base p-6 border-2"
      style={{ borderColor: colors.border, backgroundColor: colors.bg }}
      aria-label={stage.title}
    >
      <div className="flex items-start gap-3 mb-3">
        <span className="text-2xl mt-0.5" aria-hidden="true">{stage.dot}</span>
        <div>
          <div className="text-xs font-extrabold tracking-wide mb-0.5" style={{ color: colors.text }}>
            {stage.sessions}
          </div>
          <h3 className="font-extrabold text-sm sm:text-base leading-snug" style={{ color: colors.text }}>
            {stage.title}
          </h3>
        </div>
      </div>
      <p className="text-sm text-text-muted mb-3">{stage.intro}</p>
      <ul className="space-y-1.5 mb-3" role="list">
        {stage.points.map((point, i) => (
          <li key={i} className="flex items-start gap-2 text-sm text-text-muted" role="listitem">
            <span className="mt-0.5 shrink-0" aria-hidden="true">•</span>
            {point}
          </li>
        ))}
      </ul>
      <p
        className="text-xs font-bold leading-relaxed p-3 rounded-lg"
        style={{ color: colors.text, background: 'rgba(255,255,255,0.6)' }}
      >
        {stage.summary}
      </p>
    </article>
  )
}

export function Roadmap() {
  const [activeIdx, setActiveIdx] = useState(0)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const touchStartX = useRef<number | null>(null)

  const startAuto = () => {
    if (intervalRef.current) clearInterval(intervalRef.current)
    intervalRef.current = setInterval(() => {
      setActiveIdx(i => (i + 1) % roadmap.length)
    }, 3800)
  }

  useEffect(() => {
    startAuto()
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [])

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX
  }

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return
    const diff = touchStartX.current - e.changedTouches[0].clientX
    if (Math.abs(diff) > 50) {
      if (diff > 0) {
        setActiveIdx(i => (i + 1) % roadmap.length)
      } else {
        setActiveIdx(i => (i - 1 + roadmap.length) % roadmap.length)
      }
      startAuto()
    }
    touchStartX.current = null
  }

  return (
    <section id="roadmap" aria-labelledby="roadmap-heading" className="section-padding bg-white">
      <div className="container-site">
        <div className="text-center mb-10 sm:mb-14 max-w-3xl mx-auto">
          <h2 id="roadmap-heading" className="heading-2 mb-4">
            18 BUỔI — 3 CHẶNG —{' '}
            <span className="text-gradient-orange-purple">1 ĐÍCH ĐẾN</span>
          </h2>
          <p className="text-base sm:text-lg text-text-muted">
            Lộ trình con đi từ &quot;ôn nền&quot; đến &quot;tối ưu đề thi vòng loại RBT2026&quot;
            <br />
            Không học vu vơ. Không nhảy cóc. Không bỏ sót.
          </p>
        </div>

        {/* Desktop: 3-col grid */}
        <div className="hidden md:grid grid-cols-3 gap-5 sm:gap-6 mb-10" role="list">
          {roadmap.map(stage => (
            <StageCard key={stage.id} stage={stage} />
          ))}
        </div>

        {/* Mobile: carousel */}
        <div
          className="md:hidden mb-8 overflow-hidden"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          <div
            className="flex transition-transform duration-500 ease-in-out"
            style={{ transform: `translateX(-${activeIdx * 100}%)` }}
          >
            {roadmap.map(stage => (
              <div key={stage.id} className="min-w-full px-1">
                <StageCard stage={stage} />
              </div>
            ))}
          </div>
          <div className="flex justify-center gap-2 mt-4">
            {roadmap.map((_, i) => (
              <button
                key={i}
                aria-label={`Chặng ${i + 1}`}
                onClick={() => { setActiveIdx(i); startAuto() }}
                className={`h-2 rounded-full transition-all duration-300 ${
                  i === activeIdx ? 'w-6 bg-green-500' : 'w-2 bg-gray-300'
                }`}
              />
            ))}
          </div>
        </div>

        <div className="max-w-2xl mx-auto bg-purple-50 rounded-2xl border border-purple-100 p-5 sm:p-6 text-center">
          <p className="text-sm sm:text-base text-text-dark leading-relaxed">
            Sau 18 buổi, con không chỉ &quot;biết đề&quot; —
            <br />
            con{' '}
            <span className="font-extrabold text-primary-orange">CÁCH TỐI ƯU</span>. Biết{' '}
            <span className="font-extrabold text-primary-purple">MẸO</span>.{' '}
            <span className="font-extrabold text-text-dark">PHẢN XẠ</span> nhanh hơn.
          </p>
        </div>
      </div>
    </section>
  )
}
