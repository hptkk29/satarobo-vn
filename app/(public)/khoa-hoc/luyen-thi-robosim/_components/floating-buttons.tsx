'use client'

import { useScrollPosition } from '../_hooks/use-scroll-position'
import { trackAndOpen } from '../_utils/track-cta'

export function FloatingButtons() {
  const scrollY = useScrollPosition()
  const visible = scrollY > 600

  return (
    <div
      className={`fixed bottom-6 right-4 z-40 flex flex-col gap-2 transition-all duration-300 ${
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'
      }`}
      aria-label="Đăng ký nhanh"
    >
      <button
        onClick={() => trackAndOpen('R1', 'floating_R1')}
        className="rounded-xl py-2.5 px-4 font-extrabold text-xs text-white shadow-lg hover:opacity-90 transition"
        style={{ background: 'linear-gradient(135deg, #2563EB, #3b82f6)' }}
        aria-label="Đăng ký Khoá R1 cho Tiểu học — 490.000đ"
        tabIndex={visible ? 0 : -1}
      >
        🟦 Đăng ký R1
      </button>
      <button
        onClick={() => trackAndOpen('R2', 'floating_R2')}
        className="rounded-xl py-2.5 px-4 font-extrabold text-xs text-white shadow-lg hover:opacity-90 transition"
        style={{ background: 'linear-gradient(135deg, #7C3AED, #a78bfa)' }}
        aria-label="Đăng ký Khoá R2 cho THCS — 490.000đ"
        tabIndex={visible ? 0 : -1}
      >
        🟪 Đăng ký R2
      </button>
      <a
        href="https://zalo.me/0818823720"
        target="_blank"
        rel="noopener noreferrer"
        className="rounded-xl py-2.5 px-4 font-extrabold text-xs text-white bg-green-500 hover:bg-green-600 shadow-lg transition text-center"
        aria-label="Chat Zalo với tư vấn viên"
        tabIndex={visible ? 0 : -1}
      >
        💬 Chat Zalo
      </a>
    </div>
  )
}
