'use client'

import { useState, useEffect, useRef } from 'react'
import { pains } from '../_data/pains'

const BORDER_COLORS = ['#ef4444', '#f97316', '#eab308']

function PainCard({ pain, index }: { pain: typeof pains[0]; index: number }) {
  return (
    <article
      className="card-base p-6 border-l-4"
      style={{ borderLeftColor: BORDER_COLORS[index] }}
      aria-label={pain.label}
    >
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xl" aria-hidden="true">{pain.icon}</span>
        <span className="text-xs font-extrabold tracking-widest text-text-muted uppercase">
          {pain.label}
        </span>
      </div>
      <h3 className="font-extrabold text-base sm:text-lg text-text-dark mb-3 leading-snug">
        {pain.title}
      </h3>
      <p className="text-sm sm:text-base text-text-muted leading-relaxed whitespace-pre-line">
        {pain.body}
      </p>
    </article>
  )
}

export function Pain() {
  const [activeIdx, setActiveIdx] = useState(0)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const touchStartX = useRef<number | null>(null)

  const startAuto = () => {
    if (intervalRef.current) clearInterval(intervalRef.current)
    intervalRef.current = setInterval(() => {
      setActiveIdx(i => (i + 1) % pains.length)
    }, 3500)
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
        setActiveIdx(i => (i + 1) % pains.length)
      } else {
        setActiveIdx(i => (i - 1 + pains.length) % pains.length)
      }
      startAuto()
    }
    touchStartX.current = null
  }

  return (
    <section id="pain" aria-labelledby="pain-heading" className="section-padding bg-soft-cream">
      <div className="container-site">
        <div className="text-center mb-10 sm:mb-14 max-w-3xl mx-auto">
          <h2 id="pain-heading" className="heading-2 mb-4">
            3 SỰ THẬT VỀ VÒNG LOẠI ROBOTICS 2026 —
            <br />
            <span className="text-gradient-orange-purple">MÀ ÍT TRUNG TÂM DÁM NÓI VỚI BỐ MẸ</span>
          </h2>
          <p className="text-base sm:text-lg text-text-muted">
            Bố mẹ đọc xong 3 sự thật này — sẽ hiểu vì sao &quot;con học chăm, con luyện
            nhiều&quot; <strong>KHÔNG còn là lợi thế</strong> nữa.
          </p>
        </div>

        {/* Desktop: 3-col grid */}
        <div className="hidden md:grid grid-cols-3 gap-5 sm:gap-6 mb-10">
          {pains.map((pain, i) => (
            <PainCard key={pain.id} pain={pain} index={i} />
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
            {pains.map((pain, i) => (
              <div key={pain.id} className="min-w-full px-1">
                <PainCard pain={pain} index={i} />
              </div>
            ))}
          </div>
          <div className="flex justify-center gap-2 mt-4">
            {pains.map((_, i) => (
              <button
                key={i}
                aria-label={`Sự thật ${i + 1}`}
                onClick={() => { setActiveIdx(i); startAuto() }}
                className={`h-2 rounded-full transition-all duration-300 ${
                  i === activeIdx ? 'w-6 bg-red-500' : 'w-2 bg-gray-300'
                }`}
              />
            ))}
          </div>
        </div>

        {/* Pivot */}
        <div className="max-w-2xl mx-auto text-center space-y-4">
          <p className="text-lg font-bold text-text-dark">
            Bố mẹ đọc đến đây — thấy đúng không?
          </p>
          <div className="text-sm sm:text-base text-text-muted space-y-1">
            <p>Vấn đề <strong>KHÔNG PHẢI</strong> con không có đề.</p>
            <p>Vấn đề <strong>KHÔNG PHẢI</strong> con không luyện đủ.</p>
            <p>Vấn đề <strong>KHÔNG PHẢI</strong> con không cố gắng.</p>
          </div>
          <div className="text-sm sm:text-base text-text-dark space-y-1">
            <p>Vấn đề là cả nước đều có đề.</p>
            <p>Cả nước đều luyện free.</p>
            <p>Cả nước đều đứng <strong>CÙNG MỘT VẠCH</strong>.</p>
          </div>
          <p className="text-base sm:text-lg font-bold text-text-dark">
            BTC vòng loại không lấy &quot;đứng cùng vạch&quot;.
            <br />
            BTC chỉ lấy <strong className="text-primary-orange">NGƯỜI VƯỢT LÊN TRƯỚC</strong>.
          </p>
          <a
            href="#solution"
            className="inline-block mt-2 text-primary-purple font-semibold hover:underline"
          >
            👉 Mình có cách đưa con bố mẹ vượt lên trước ↓
          </a>
        </div>
      </div>
    </section>
  )
}
