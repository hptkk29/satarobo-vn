'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { BookOpen, Target, X } from 'lucide-react'
import { courseGroups, type Course } from '../_data/courses-pricing'

const examCourses = courseGroups[0].courses
const deepCourses = courseGroups[1].courses

function getCoursePrice(course: Course): number {
  const c = course as { earlyBirdPrice?: number; comboPrice?: number; fixedPrice?: number }
  return c.earlyBirdPrice ?? c.comboPrice ?? c.fixedPrice ?? 0
}

function selectCourse(value: string) {
  if (typeof window === 'undefined') return
  sessionStorage.setItem('sata-course-selected', value)
  window.dispatchEvent(new CustomEvent('sata-course-selected', { detail: value }))
}

function scrollToForm() {
  document.getElementById('registration-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

export function AgeCoursePopup() {
  const [open, setOpen] = useState(false)
  const [goal, setGoal] = useState<'exam' | 'deep'>('exam')
  const [selectedCourseId, setSelectedCourseId] = useState(examCourses[0].id)

  const triggeredRef = useRef(false)
  const openTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reopenTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const courses = goal === 'exam' ? examCourses : deepCourses
  const selectedCourse = courses.find(c => c.id === selectedCourseId) ?? courses[0]

  // Reset course selection when goal changes
  useEffect(() => {
    setSelectedCourseId(courses[0].id)
  }, [goal]) // eslint-disable-line react-hooks/exhaustive-deps

  const dismiss = useCallback(() => {
    setOpen(false)
    if (reopenTimerRef.current) clearInterval(reopenTimerRef.current)
    reopenTimerRef.current = setInterval(() => setOpen(true), 90_000)
  }, [])

  const handleChoose = () => {
    selectCourse(selectedCourse.value)
    setOpen(false)
    setTimeout(scrollToForm, 50)
  }

  // IntersectionObserver on #roadmap section — trigger after 600ms
  useEffect(() => {
    const target = document.getElementById('roadmap')
    if (!target) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !triggeredRef.current) {
          triggeredRef.current = true
          openTimerRef.current = setTimeout(() => setOpen(true), 600)
        }
      },
      { threshold: 0.1 },
    )
    observer.observe(target)

    return () => {
      observer.disconnect()
      if (openTimerRef.current) clearTimeout(openTimerRef.current)
      if (reopenTimerRef.current) clearInterval(reopenTimerRef.current)
    }
  }, [])

  // ESC key to dismiss
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') dismiss() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, dismiss])

  if (!open) return null

  const price = getCoursePrice(selectedCourse)

  return (
    <div
      className="fixed inset-0 z-[9990] flex items-end justify-center bg-black/60 p-4 sm:items-center"
      onClick={dismiss}
      role="dialog"
      aria-modal="true"
      aria-label="Tìm khóa học phù hợp"
    >
      <div
        className="relative w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl animate-slide-up"
        onClick={e => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={dismiss}
          className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full text-text-muted transition hover:bg-gray-100 hover:text-text-dark"
          aria-label="Đóng"
        >
          <X className="h-5 w-5" />
        </button>

        <h3 className="mb-1 pr-8 text-lg font-black text-text-dark">Tìm khóa phù hợp cho con</h3>
        <p className="mb-4 text-sm text-text-muted">Chọn mục tiêu và khóa học để xem chi tiết</p>

        {/* Goal toggle */}
        <div className="mb-4 flex rounded-xl border border-gray-200 p-1">
          <button
            type="button"
            onClick={() => setGoal('exam')}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-bold transition ${
              goal === 'exam'
                ? 'bg-primary-orange text-white shadow-sm'
                : 'text-text-muted hover:text-text-dark'
            }`}
          >
            <Target className="h-4 w-4" aria-hidden="true" />
            Luyện thi
          </button>
          <button
            type="button"
            onClick={() => setGoal('deep')}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-bold transition ${
              goal === 'deep'
                ? 'bg-primary-purple text-white shadow-sm'
                : 'text-text-muted hover:text-text-dark'
            }`}
          >
            <BookOpen className="h-4 w-4" aria-hidden="true" />
            Chuyên sâu
          </button>
        </div>

        {/* Course selector */}
        <div className="mb-4">
          <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-text-muted">
            Chọn khóa
          </label>
          <select
            value={selectedCourseId}
            onChange={e => setSelectedCourseId(e.target.value)}
            className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-text-dark focus:border-primary-orange focus:outline-none focus:ring-2 focus:ring-primary-orange/20"
          >
            {courses.map(c => (
              <option key={c.id} value={c.id}>
                {c.shortName} — {c.grade}
              </option>
            ))}
          </select>
        </div>

        {/* Course summary */}
        <div className="mb-5 rounded-2xl bg-soft-cream p-3.5">
          <div className="mb-1 text-sm font-bold text-text-dark">{selectedCourse.hook}</div>
          <div className="text-xs text-text-muted">
            {selectedCourse.sessions} buổi · {selectedCourse.totalDuration} · {selectedCourse.grade}
          </div>
          {price > 0 && (
            <div className="mt-2 text-base font-black text-primary-orange">
              {price.toLocaleString('vi-VN')}đ
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={handleChoose}
          className="w-full rounded-xl bg-primary-orange py-3 font-bold text-white shadow-orange-glow transition hover:bg-primary-orange-dark active:scale-95"
        >
          Chọn khóa này — Đăng ký ngay
        </button>
      </div>
    </div>
  )
}
