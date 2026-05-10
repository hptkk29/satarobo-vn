'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { competitionStages, type CompetitionStage, type StageColor } from '../_data/competition-roadmap'

const colorConfig: Record<StageColor, { hex: string; bg: string; soft: string; shadow: string }> = {
  urgent: {
    hex: '#F97316',
    bg: '#FFF7ED',
    soft: '#FFEDD5',
    shadow: 'rgba(249,115,22,0.24)',
  },
  warning: {
    hex: '#D97706',
    bg: '#FFFBEB',
    soft: '#FEF3C7',
    shadow: 'rgba(217,119,6,0.20)',
  },
  'r1-primary': {
    hex: '#2563EB',
    bg: '#EFF6FF',
    soft: '#DBEAFE',
    shadow: 'rgba(37,99,235,0.20)',
  },
  'r2-primary': {
    hex: '#7C3AED',
    bg: '#F5F3FF',
    soft: '#EDE9FE',
    shadow: 'rgba(124,58,237,0.20)',
  },
}

function getStageKey(stage: CompetitionStage, index: number) {
  return `${index}-${stage.title}-${stage.subtitle || stage.date}`
}

function StageCard({ stage }: { stage: CompetitionStage }) {
  const c = colorConfig[stage.color]
  return (
    <div
      role="listitem"
      className="relative flex flex-col items-center justify-center gap-2 rounded-2xl p-5 text-center overflow-hidden transition-transform duration-200 hover:-translate-y-1"
      style={{
        minHeight: 178,
        background: stage.isCurrent
          ? `linear-gradient(145deg, ${c.bg} 0%, #fff 62%, ${c.soft} 100%)`
          : `linear-gradient(145deg, #fff 0%, #fff 64%, ${c.bg} 100%)`,
        border: `2px solid ${c.hex}`,
        boxShadow: stage.isCurrent
          ? `0 14px 34px ${c.shadow}, 0 0 0 5px ${c.hex}20`
          : '0 10px 26px rgba(17,24,39,0.07)',
        animation: stage.isCurrent ? 'pulse 2.5s ease-in-out infinite' : 'none',
      }}
    >
      {/* Decorative circle */}
      <div
        className="absolute -top-11 -right-9 w-28 h-28 rounded-full pointer-events-none"
        style={{ background: c.soft, opacity: 0.75 }}
      />
      {/* Top accent bar */}
      <div
        className="absolute top-0 left-0 right-0 h-1.5 rounded-t-2xl"
        style={{ background: `linear-gradient(90deg, ${c.hex}, ${c.hex}66)` }}
      />

      <span
        className="relative z-10 w-12 h-12 inline-flex items-center justify-center rounded-full bg-white text-3xl"
        style={{ boxShadow: `0 8px 20px ${c.shadow}` }}
        aria-hidden="true"
      >
        {stage.icon}
      </span>

      <div className="min-h-11 flex flex-col justify-center">
        <div
          className="text-sm font-black tracking-wider uppercase leading-snug"
          style={{ color: c.hex }}
        >
          {stage.title}
        </div>
        {stage.subtitle && (
          <div
            className="text-xs font-extrabold tracking-wide uppercase leading-snug"
            style={{ color: c.hex, opacity: 0.75 }}
          >
            {stage.subtitle}
          </div>
        )}
      </div>

      <div
        className="inline-flex items-center justify-center text-xs font-extrabold text-gray-500 bg-gray-50 border border-gray-100 rounded-xl px-3 py-1.5"
      >
        {stage.date}
      </div>

      {stage.isCurrent && (
        <div
          className="text-xs font-black text-white uppercase tracking-wide rounded-full px-3 py-1"
          style={{ background: c.hex, boxShadow: `0 8px 18px ${c.shadow}` }}
        >
          SẮP DIỄN RA!
        </div>
      )}
    </div>
  )
}

export function CompetitionRoadmap() {
  const [activeIdx, setActiveIdx] = useState(0)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const touchStartX = useRef<number | null>(null)

  const startAuto = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current)
    intervalRef.current = setInterval(() => {
      setActiveIdx(i => (i + 1) % competitionStages.length)
    }, 3000)
  }, [])

  useEffect(() => {
    startAuto()
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [startAuto])

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX
  }

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return
    const diff = touchStartX.current - e.changedTouches[0].clientX
    if (Math.abs(diff) > 50) {
      if (diff > 0) {
        setActiveIdx(i => (i + 1) % competitionStages.length)
      } else {
        setActiveIdx(i => (i - 1 + competitionStages.length) % competitionStages.length)
      }
      startAuto()
    }
    touchStartX.current = null
  }

  return (
    <div role="list" aria-label="Hành trình 4 vòng thi RBT2026">
      {/* Desktop: 4-col grid */}
      <div className="hidden md:grid grid-cols-4 gap-6 w-full">
        {competitionStages.map((stage, i) => (
          <div key={getStageKey(stage, i)} className="relative min-w-0 flex">
            <StageCard stage={stage} />
            {i < competitionStages.length - 1 && (
              <div className="absolute top-1/2 -right-4 -translate-y-1/2 z-10">
                <div className="w-7 h-7 inline-flex items-center justify-center rounded-full bg-white border border-gray-200 shadow text-gray-400 text-base font-black">
                  →
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Mobile: carousel */}
      <div
        className="md:hidden overflow-hidden"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <div
          className="flex transition-transform duration-500 ease-in-out"
          style={{ transform: `translateX(-${activeIdx * 100}%)` }}
        >
          {competitionStages.map((stage, i) => (
            <div key={getStageKey(stage, i)} className="min-w-full px-1">
              <StageCard stage={stage} />
            </div>
          ))}
        </div>
        <div className="flex justify-center gap-2 mt-4">
          {competitionStages.map((_, i) => (
            <button
              key={i}
              aria-label={`Vòng ${i + 1}`}
              onClick={() => { setActiveIdx(i); startAuto() }}
              className={`h-2 rounded-full transition-all duration-300 ${
                i === activeIdx ? 'w-6 bg-primary-orange' : 'w-2 bg-gray-300'
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
