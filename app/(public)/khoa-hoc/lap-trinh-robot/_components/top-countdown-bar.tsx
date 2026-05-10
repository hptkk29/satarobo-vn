'use client'

import { useEffect, useState } from 'react'
import { Flame } from 'lucide-react'
import { useCountdown, formatDeadline } from '../_hooks/use-countdown'
import { useScrollPosition } from '../_hooks/use-scroll-position'

export function TopCountdownBar() {
  const { timeLeft, deadline } = useCountdown()
  const scrollY = useScrollPosition()
  const [isHidden, setIsHidden] = useState(false)

  useEffect(() => {
    setIsHidden(current => {
      if (!current && scrollY > 80) return true
      if (current && scrollY < 8) return false
      return current
    })
  }, [scrollY])

  const pad = (n: number) => String(n).padStart(2, '0')

  return (
    <div
      aria-hidden={isHidden}
      className={`overflow-hidden transition-[max-height,opacity] duration-300 ease-out ${
        isHidden ? 'max-h-0 opacity-0 pointer-events-none' : 'max-h-16 opacity-100'
      }`}
    >
      <div className="bg-gradient-orange-purple text-white">
        <div className="container-site py-2 sm:py-2.5">
          <div className="flex items-center justify-center gap-2 sm:gap-3">
            <Flame className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0 animate-pulse" />
            <div className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm font-bold text-center">
              <span className="hidden sm:inline whitespace-nowrap">
                ƯU ĐÃI KHAI GIẢNG — HẾT HẠN TRƯỚC{' '}
                <span className="font-black text-yellow-200">{formatDeadline(deadline).toUpperCase()}</span>
                {' '}— CÒN:
              </span>
              <span className="sm:hidden whitespace-nowrap">ƯU ĐÃI:</span>
              <span className="font-black text-yellow-200 whitespace-nowrap tabular-nums">
                {pad(timeLeft.days)}d : {pad(timeLeft.hours)}h : {pad(timeLeft.minutes)}m : {pad(timeLeft.seconds)}s
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
