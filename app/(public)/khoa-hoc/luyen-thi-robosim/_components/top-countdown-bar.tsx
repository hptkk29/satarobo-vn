'use client'

import { useCountdown, getNextDeadline, getExamDate } from '../_hooks/use-countdown'
import { useScrollPosition } from '../_hooks/use-scroll-position'

function pad(n: number) {
  return String(n).padStart(2, '0')
}

function CountdownDisplay({
  days,
  hours,
  minutes,
  seconds,
  expired,
}: {
  days: number
  hours: number
  minutes: number
  seconds: number
  expired: boolean
}) {
  if (expired) return <span className="font-black text-white">Đã hết hạn</span>
  return (
    <span className="inline-flex items-baseline gap-0.5 font-black text-white text-xs sm:text-sm">
      <span>{pad(days)}</span>
      <span className="opacity-60 text-[10px]">ng</span>
      <span className="opacity-60 mx-0.5">:</span>
      <span>{pad(hours)}</span>
      <span className="opacity-60 text-[10px]">g</span>
      <span className="opacity-60 mx-0.5">:</span>
      <span>{pad(minutes)}</span>
      <span className="opacity-60 text-[10px]">ph</span>
      <span className="opacity-60 mx-0.5">:</span>
      <span>{pad(seconds)}</span>
      <span className="opacity-60 text-[10px]">s</span>
    </span>
  )
}

export function TopCountdownBar() {
  const { timeLeft: dealTime } = useCountdown(getNextDeadline)
  const { timeLeft: examTime } = useCountdown(getExamDate)
  const scrollY = useScrollPosition()
  const isHidden = scrollY > 150

  return (
    <div
      role="banner"
      aria-label="Thông báo ưu đãi và ngày thi"
      aria-hidden={isHidden}
      className={`overflow-hidden transition-[max-height,opacity] duration-300 ease-out ${
        isHidden ? 'max-h-0 opacity-0 pointer-events-none' : 'max-h-20 opacity-100'
      }`}
      style={{ background: 'linear-gradient(90deg, #1a0845 0%, #2d1060 50%, #1a0845 100%)' }}
    >
      <div className="container-site flex items-center justify-center gap-6 sm:gap-10 py-2 px-4 flex-wrap">
        {/* Deal deadline */}
        <div className="flex items-center gap-1.5 text-xs">
          <span aria-hidden="true">⏰</span>
          <span className="text-white/80 font-semibold hidden sm:inline">ƯU ĐÃI 490K KẾT THÚC SAU:</span>
          <span className="text-white/80 font-semibold sm:hidden">490K HẾT SAU:</span>
          <CountdownDisplay {...dealTime} />
        </div>

        <div className="w-px h-4 bg-white/20 hidden sm:block" aria-hidden="true" />

        {/* Exam date */}
        <div className="flex items-center gap-1.5 text-xs">
          <span aria-hidden="true">🏆</span>
          <span className="text-white/80 font-semibold hidden sm:inline">VÒNG LOẠI 26/7 SAU:</span>
          <span className="text-white/80 font-semibold sm:hidden">THI 26/7 SAU:</span>
          <CountdownDisplay {...examTime} />
        </div>
      </div>
    </div>
  )
}
