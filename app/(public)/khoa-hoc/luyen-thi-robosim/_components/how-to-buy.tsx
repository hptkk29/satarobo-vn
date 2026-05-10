'use client'

import { useState, useCallback, useEffect } from 'react'
import Image from 'next/image'

const VIDEO_ID = '3w1rJmB_eo0'

const steps = [
  { num: 1, label: 'Truy cập SataWorld.vn' },
  { num: 2, label: 'Đăng ký tài khoản miễn phí' },
  { num: 3, label: 'Chọn đúng khoá R1 hoặc R2' },
  { num: 4, label: 'Thanh toán và xác nhận' },
  { num: 5, label: 'Vào tài khoản và học ngay' },
  { num: 6, label: 'Zalo hỗ trợ khi cần' },
]

export function HowToBuy() {
  const [open, setOpen] = useState(false)

  const close = useCallback(() => setOpen(false), [])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, close])

  return (
    <section
      id="huong-dan"
      aria-labelledby="howtobuy-heading"
      className="section-padding"
      style={{ background: 'linear-gradient(160deg, #0f0529 0%, #1a0845 60%, #0d0420 100%)' }}
    >
      <div className="container-site">
        {/* Heading */}
        <div className="text-center mb-8 sm:mb-10">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 mb-4">
            <span className="text-white/80 text-xs font-black uppercase tracking-wider">▶ HƯỚNG DẪN ĐĂNG KÝ</span>
          </div>
          <h2
            id="howtobuy-heading"
            className="text-2xl sm:text-3xl lg:text-4xl font-black text-white leading-tight"
          >
            Mua và bắt đầu học trong ít phút
          </h2>
          <p className="mt-3 text-white/60 text-sm sm:text-base max-w-xl mx-auto">
            Từ đăng ký tài khoản đến bài học đầu tiên — thực hiện cực kỳ đơn giản
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-8 items-center">
          {/* YouTube thumbnail */}
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Phát video hướng dẫn đăng ký tài khoản SataWorld và mua khóa học"
            className="group relative w-full overflow-hidden rounded-2xl shadow-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-orange"
          >
            <Image
              src={`https://img.youtube.com/vi/${VIDEO_ID}/maxresdefault.jpg`}
              alt="Hướng dẫn đăng ký tài khoản SataWorld và mua khóa học"
              width={1280}
              height={720}
              unoptimized
              className="w-full object-cover aspect-video"
              loading="lazy"
            />
            {/* Play button overlay */}
            <div className="absolute inset-0 flex items-center justify-center bg-black/30 transition group-hover:bg-black/20">
              <div
                className="flex h-16 w-16 sm:h-20 sm:w-20 items-center justify-center rounded-full bg-white/95 shadow-2xl transition group-hover:scale-110"
                aria-hidden="true"
              >
                <div className="ml-1 border-y-[10px] border-l-[18px] border-y-transparent border-l-primary-orange" />
              </div>
            </div>
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 px-4 py-3">
              <p className="text-white text-xs sm:text-sm font-semibold text-left">
                Hướng dẫn đăng ký tài khoản SataWorld và mua khóa học
              </p>
            </div>
          </button>

          {/* Steps */}
          <ol
            className="flex flex-col gap-3"
            aria-label="Các bước đăng ký và học"
          >
            {steps.map((s) => (
              <li
                key={s.num}
                className="flex items-center gap-4 rounded-xl border border-white/10 bg-white/5 px-4 py-3 backdrop-blur-sm"
              >
                <span
                  className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-sm font-black text-white"
                  style={{ background: 'linear-gradient(135deg, #F97316, #FBBF24)' }}
                  aria-hidden="true"
                >
                  {s.num}
                </span>
                <span className="text-sm sm:text-base font-semibold text-white/90">{s.label}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>

      {/* Lightbox */}
      {open && (
        <div
          className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm"
          onClick={close}
          role="dialog"
          aria-modal="true"
          aria-label="Video hướng dẫn"
        >
          <div
            className="relative w-full max-w-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={close}
              aria-label="Đóng video"
              className="absolute -top-10 right-0 flex h-8 w-8 items-center justify-center rounded-full bg-white/20 text-white transition hover:bg-white/40"
            >
              ✕
            </button>
            <div className="aspect-video w-full overflow-hidden rounded-2xl shadow-2xl">
              <iframe
                src={`https://www.youtube.com/embed/${VIDEO_ID}?autoplay=1&rel=0`}
                title="Hướng dẫn đăng ký tài khoản SataWorld và mua khóa học"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="h-full w-full"
              />
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
