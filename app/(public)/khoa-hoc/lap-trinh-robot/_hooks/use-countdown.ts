'use client'

import { useEffect, useState } from 'react'

function getNextDeadline(): Date {
  const now = new Date()
  const day = now.getDate()
  const month = now.getMonth()
  const year = now.getFullYear()
  const milestones = [5, 10, 15, 20, 25]

  for (const milestone of milestones) {
    if (day <= milestone) {
      return new Date(year, month, milestone, 23, 59, 59)
    }
  }

  const lastDay = new Date(year, month + 1, 0).getDate()
  return new Date(year, month, lastDay, 23, 59, 59)
}

export function formatDeadline(deadline: Date): string {
  const dd = String(deadline.getDate()).padStart(2, '0')
  const mm = String(deadline.getMonth() + 1).padStart(2, '0')
  const yyyy = deadline.getFullYear()
  return `${dd}/${mm}/${yyyy}`
}

interface TimeLeft {
  days: number
  hours: number
  minutes: number
  seconds: number
  total: number
  expired: boolean
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

export function useCountdown() {
  const [deadline, setDeadline] = useState<Date>(getNextDeadline)
  const [timeLeft, setTimeLeft] = useState<TimeLeft>(() => getTimeRemaining(getNextDeadline()))

  useEffect(() => {
    const interval = setInterval(() => {
      const remaining = getTimeRemaining(deadline)
      setTimeLeft(remaining)

      if (remaining.expired) {
        const newDeadline = getNextDeadline()
        setDeadline(newDeadline)
        setTimeLeft(getTimeRemaining(newDeadline))
      }
    }, 1000)

    return () => clearInterval(interval)
  }, [deadline])

  return { deadline, timeLeft }
}
