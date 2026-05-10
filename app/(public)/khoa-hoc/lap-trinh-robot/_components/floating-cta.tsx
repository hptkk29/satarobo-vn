'use client'

import { ArrowRight, MessageCircle } from 'lucide-react'
import { useScrollPosition } from '../_hooks/use-scroll-position'

export function FloatingCTA() {
  const scrollY = useScrollPosition()
  const visible = scrollY > 600

  return (
    <div
      className={`fixed bottom-6 right-4 z-50 flex flex-col items-end gap-2.5 transition-all duration-300 sm:bottom-8 sm:right-6 ${
        visible ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-4 opacity-0'
      }`}
      aria-hidden={!visible}
    >
      {/* Zalo */}
      <a
        href="https://zalo.me/0818823720"
        target="_blank"
        rel="noopener noreferrer"
        className="relative flex h-12 w-12 items-center justify-center rounded-full bg-[#0068FF] shadow-lg transition hover:scale-110 active:scale-95"
        aria-label="Chat Zalo với Sata Robo"
        tabIndex={visible ? 0 : -1}
      >
        <MessageCircle className="h-6 w-6 text-white" aria-hidden="true" />
        <span
          className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full bg-success animate-hot-pulse"
          aria-hidden="true"
        />
      </a>

      {/* Register */}
      <a
        href="#registration-form"
        className="flex items-center gap-2 rounded-full bg-primary-orange px-5 py-2.5 text-sm font-bold text-white shadow-orange-glow transition hover:scale-105 hover:bg-primary-orange-dark active:scale-95"
        tabIndex={visible ? 0 : -1}
      >
        Đăng ký ngay
        <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </a>
    </div>
  )
}
