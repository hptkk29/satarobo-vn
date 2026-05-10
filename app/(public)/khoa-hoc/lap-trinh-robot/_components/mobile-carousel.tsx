'use client'

import { useState, useEffect, useRef, useCallback } from 'react'

const SWIPE_THRESHOLD = 40

interface MobileCarouselProps {
  children: React.ReactNode
  autoInterval?: number
  accentColor?: string
  isPaused?: boolean
}

export function MobileCarousel({
  children,
  autoInterval = 3500,
  accentColor = '#F97316',
  isPaused = false,
}: MobileCarouselProps) {
  const slides = Array.isArray(children) ? children : [children]
  const n = slides.length
  const [cur, setCur] = useState(0)
  const [dragOffset, setDragOffset] = useState(0)
  const [isDragging, setIsDragging] = useState(false)

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const touchStartX = useRef<number | null>(null)
  const touchStartY = useRef<number | null>(null)

  const startTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current)
    if (isPaused) return
    timerRef.current = setInterval(() => setCur(c => (c + 1) % n), autoInterval)
  }, [n, autoInterval, isPaused])

  useEffect(() => {
    if (isPaused) {
      if (timerRef.current) clearInterval(timerRef.current)
      return
    }
    startTimer()
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [startTimer, isPaused])

  const goTo = useCallback((idx: number) => {
    setCur(((idx % n) + n) % n)
    setDragOffset(0)
    startTimer()
  }, [n, startTimer])

  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX
    touchStartY.current = e.touches[0].clientY
    setIsDragging(true)
    if (timerRef.current) clearInterval(timerRef.current)
  }

  const onTouchMove = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return
    const dx = e.touches[0].clientX - touchStartX.current
    const dy = e.touches[0].clientY - (touchStartY.current ?? 0)
    if (Math.abs(dx) > Math.abs(dy)) {
      e.preventDefault()
      setDragOffset(dx)
    }
  }

  const onTouchEnd = (e: React.TouchEvent) => {
    setIsDragging(false)
    if (touchStartX.current === null) return
    const dx = e.changedTouches[0].clientX - touchStartX.current
    const dy = e.changedTouches[0].clientY - (touchStartY.current ?? 0)
    touchStartX.current = null

    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > SWIPE_THRESHOLD) {
      goTo(dx < 0 ? cur + 1 : cur - 1)
    } else {
      setDragOffset(0)
      startTimer()
    }
  }

  const trackStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'stretch',
    willChange: 'transform',
    transition: isDragging ? 'none' : 'transform 0.38s cubic-bezier(0.4,0,0.2,1)',
    transform: `translateX(calc(-${cur * 100}% + ${dragOffset}px))`,
  }

  return (
    <div className="mc-wrap">
      <div
        className="mc-track-outer"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        <div className="mc-track-inner" style={trackStyle}>
          {slides.map((slide, i) => (
            <div key={i} className="mc-slide">{slide}</div>
          ))}
        </div>
      </div>

      <div className="mc-dots" role="tablist" aria-label="Chọn slide">
        {slides.map((_, i) => (
          <button
            key={i}
            role="tab"
            aria-selected={i === cur}
            aria-label={`Slide ${i + 1}`}
            className={`mc-dot${i === cur ? ' mc-dot--active' : ''}`}
            onClick={() => goTo(i)}
            style={{ '--mc-accent': accentColor } as React.CSSProperties}
          />
        ))}
      </div>
    </div>
  )
}
