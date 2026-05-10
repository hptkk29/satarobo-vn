'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useCountdown, getNextDeadline } from '../_hooks/use-countdown'
import { trackAndOpen } from '../_utils/track-cta'

const INTERVAL_MS = 90_000

function pad(n: number) {
  return String(n).padStart(2, '0')
}

export function ExitIntentPopup() {
  const [visible, setVisible] = useState(false)
  const [closeCount, setCloseCount] = useState(0)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const { timeLeft } = useCountdown(getNextDeadline)

  const close = useCallback(() => {
    setVisible(false)
    setCloseCount(c => c + 1)
  }, [])

  useEffect(() => {
    timerRef.current = setTimeout(() => setVisible(true), INTERVAL_MS)
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [closeCount])

  useEffect(() => {
    if (!visible) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [visible, close])

  if (!visible) return null

  const daysLeft = timeLeft.expired ? 0 : timeLeft.days
  const badgeText =
    daysLeft > 0 ? `🔥 SIÊU ƯU ĐÃI – CHỈ CÒN ${daysLeft} NGÀY` : '🔥 SIÊU ƯU ĐÃI – HÔM NAY LÀ NGÀY CUỐI'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
      onClick={close}
      role="dialog"
      aria-modal="true"
      aria-labelledby="xpop-title"
    >
      <div
        className="relative bg-white rounded-3xl shadow-2xl p-6 sm:p-8 max-w-sm w-full animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          className="absolute top-3 right-4 text-2xl text-gray-400 hover:text-gray-600 font-bold leading-none"
          onClick={close}
          aria-label="Đóng popup"
        >
          ×
        </button>

        <div className="inline-flex items-center gap-1.5 bg-orange-50 border border-orange-200 text-orange-700 text-xs font-extrabold px-3 py-1.5 rounded-full mb-4">
          {badgeText}
        </div>

        <h2 id="xpop-title" className="text-xl sm:text-2xl font-black text-text-dark mb-2 leading-snug">
          Đăng ký ngay hôm nay
          <br />
          <span className="text-primary-orange">trước khi giá tăng!</span>
        </h2>

        <p className="text-sm text-text-muted mb-4">
          Ưu đãi kết thúc sớm. Đây là cơ hội tốt nhất để con bắt đầu luyện thi.
        </p>

        {!timeLeft.expired && (
          <div className="flex justify-center gap-3 mb-4 bg-orange-50 rounded-xl p-3">
            {(['days', 'hours', 'minutes', 'seconds'] as const).map((unit, i) => (
              <div key={unit} className="flex items-center gap-1">
                {i > 0 && <span className="text-orange-400 font-black text-lg">:</span>}
                <div className="text-center">
                  <div className="text-xl font-black text-primary-orange w-9 text-center">
                    {pad(timeLeft[unit])}
                  </div>
                  <div className="text-[10px] text-text-muted">
                    {unit === 'days' ? 'ngày' : unit === 'hours' ? 'giờ' : unit === 'minutes' ? 'phút' : 'giây'}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 mb-5">
          <div className="border-2 border-blue-200 rounded-xl p-3 text-center">
            <div className="text-xs font-bold text-blue-700 mb-1">🟦 Bảng R1 · Tiểu học</div>
            <div className="text-xs line-through text-gray-400">790.000đ</div>
            <div className="text-base font-black text-blue-700">490.000đ</div>
            <div className="text-xs text-blue-600 font-semibold">Tiết kiệm 300.000đ</div>
          </div>
          <div className="border-2 border-purple-200 rounded-xl p-3 text-center">
            <div className="text-xs font-bold text-purple-700 mb-1">🟪 Bảng R2 · THCS</div>
            <div className="text-xs line-through text-gray-400">890.000đ</div>
            <div className="text-base font-black text-purple-700">490.000đ</div>
            <div className="text-xs text-purple-600 font-semibold">Tiết kiệm 400.000đ</div>
          </div>
        </div>

        <div className="flex flex-col gap-2 mb-4">
          <button
            className="w-full rounded-xl py-3 px-4 font-extrabold text-sm text-white transition hover:opacity-90"
            style={{ background: 'linear-gradient(135deg, #2563EB, #3b82f6)' }}
            onClick={() => { close(); trackAndOpen('R1', 'popup_R1') }}
          >
            🟦 Đăng ký Bảng R1 ngay — 490.000đ →
          </button>
          <button
            className="w-full rounded-xl py-3 px-4 font-extrabold text-sm text-white transition hover:opacity-90"
            style={{ background: 'linear-gradient(135deg, #7C3AED, #a78bfa)' }}
            onClick={() => { close(); trackAndOpen('R2', 'popup_R2') }}
          >
            🟪 Đăng ký Bảng R2 ngay — 490.000đ →
          </button>
        </div>

        <button
          className="w-full text-xs text-text-muted hover:underline"
          onClick={close}
        >
          Tôi muốn đọc thêm trước khi quyết định →
        </button>
      </div>
    </div>
  )
}
