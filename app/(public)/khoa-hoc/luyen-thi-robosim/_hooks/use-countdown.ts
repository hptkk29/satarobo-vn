'use client'

import { useEffect, useState } from 'react'

export interface TimeLeft {
  days: number
  hours: number
  minutes: number
  seconds: number
  total: number
  expired: boolean
}

const INITIAL_TIME_LEFT: TimeLeft = {
  days: 0,
  hours: 0,
  minutes: 0,
  seconds: 0,
  total: 0,
  expired: false,
}

function getTimeRemaining(deadline: Date): TimeLeft {
  const diff = deadline.getTime() - Date.now()
  if (diff <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0, total: 0, expired: true }
  return {
    days: Math.floor(diff / (1000 * 60 * 60 * 24)),
    hours: Math.floor((diff / (1000 * 60 * 60)) % 24),
    minutes: Math.floor((diff / (1000 * 60)) % 60),
    seconds: Math.floor((diff / 1000) % 60),
    total: diff,
    expired: false,
  }
}

export function getNextDeadline(): Date {
  const now = new Date()
  const day = now.getDate()
  const month = now.getMonth()
  const year = now.getFullYear()
  const milestones = [5, 10, 15, 20, 25]
  for (const m of milestones) {
    if (day <= m) return new Date(year, month, m + 1, 0, 0, 0)
  }
  return new Date(year, month + 1, 2, 0, 0, 0)
}

export function getExamDate(): Date {
  const now = new Date()
  const year = now.getFullYear()
  const examThisYear = new Date(year, 6, 26, 0, 0, 0)
  return now > examThisYear ? new Date(year + 1, 6, 26, 0, 0, 0) : examThisYear
}

export function formatDeadline(deadline: Date): string {
  const dd = String(deadline.getDate()).padStart(2, '0')
  const mm = String(deadline.getMonth() + 1).padStart(2, '0')
  const yyyy = deadline.getFullYear()
  return `${dd}/${mm}/${yyyy}`
}

export function useCountdown(getDeadline: () => Date) {
  const [deadline, setDeadline] = useState<Date>(getDeadline)
  const [timeLeft, setTimeLeft] = useState<TimeLeft>(INITIAL_TIME_LEFT)

  useEffect(() => {
    const tick = () => {
      const remaining = getTimeRemaining(deadline)
      setTimeLeft(remaining)
      if (remaining.expired) {
        const next = getDeadline()
        setDeadline(next)
        setTimeLeft(getTimeRemaining(next))
      }
    }

    tick()
    const interval = setInterval(() => {
      tick()
    }, 1000)
    return () => clearInterval(interval)
  }, [deadline, getDeadline])

  return { deadline, timeLeft }
}
