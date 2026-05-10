'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { MessageSquareQuote, Star } from 'lucide-react'
import { testimonials } from '../_data/testimonials'
import { MobileCarousel } from './mobile-carousel'

const videoItems = testimonials.filter(t => t.videoId)

function TestiCard({
  item,
  onPlay,
}: {
  item: (typeof testimonials)[number]
  onPlay: (videoId: string) => void
}) {
  return (
    <article className="flex h-full flex-col rounded-2xl border border-gray-100 bg-white p-5 shadow-card sm:p-6">
      <div className="mb-3 flex text-yellow-400" aria-label="5 sao">
        {Array.from({ length: 5 }).map((_, i) => (
          <Star key={i} className="h-4 w-4 fill-current" />
        ))}
      </div>

      <p className="mb-4 flex-1 text-sm leading-relaxed text-text-dark italic">
        &ldquo;{item.content}&rdquo;
      </p>

      <div className="mb-4 flex items-center gap-3">
        <div
          className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${item.avatarColor} text-sm font-bold text-white`}
          aria-hidden="true"
        >
          {item.avatar}
        </div>
        <div>
          <div className="text-sm font-bold text-text-dark">{item.name}</div>
          <div className="text-xs text-text-muted">{item.role} · {item.location}</div>
        </div>
      </div>

      {item.videoId && (
        <button
          type="button"
          onClick={() => onPlay(item.videoId!)}
          className="group relative w-full overflow-hidden rounded-xl"
          aria-label={`Phát video cảm nhận của ${item.name}`}
        >
          <div className="relative aspect-video overflow-hidden bg-gray-900">
            <Image
              src={`https://img.youtube.com/vi/${item.videoId}/hqdefault.jpg`}
              alt={`Ảnh thumbnail video của ${item.name}`}
              fill
              unoptimized
              className="object-cover transition duration-300 group-hover:scale-105 group-hover:brightness-75"
              sizes="(max-width: 640px) 90vw, 400px"
            />
            <div className="absolute inset-0 flex items-center justify-center bg-black/20 transition group-hover:bg-black/40">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/90 shadow-lg transition group-hover:scale-110">
                <svg viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6 translate-x-0.5 text-primary-orange">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </div>
            </div>
          </div>
          <div className="bg-gray-50 py-1.5 text-center text-xs font-semibold text-text-muted transition group-hover:text-primary-orange">
            Bấm để xem video
          </div>
        </button>
      )}
    </article>
  )
}

function VideoModal({ videoId, onClose }: { videoId: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/85 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Video cảm nhận học viên"
    >
      <div
        className="relative w-full max-w-3xl overflow-hidden rounded-2xl bg-black shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Đóng video"
          className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm transition hover:bg-black/80"
        >
          <span className="text-xl leading-none">×</span>
        </button>
        <div className="aspect-video">
          <iframe
            src={`https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1`}
            title="Video cảm nhận học viên Sata Robo"
            allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
            allowFullScreen
            className="h-full w-full"
          />
        </div>
      </div>
    </div>
  )
}

export function Testimonials() {
  const [activeVideo, setActiveVideo] = useState<string | null>(null)

  return (
    <section id="testimonials" className="section-padding bg-soft-cream" aria-labelledby="testi-heading">
      <div className="container-site">
        <div className="mb-10 text-center sm:mb-14">
          <div className="badge-purple mb-4">
            <MessageSquareQuote className="h-4 w-4" />
            PHỤ HUYNH VÀ HỌC SINH NÓI GÌ
          </div>
          <h2 id="testi-heading" className="heading-2 mb-4 text-text-dark">
            Hàng trăm học sinh đã tham gia khóa học
            <br className="hidden sm:block" />
            <span className="text-gradient-orange-purple">và hào hứng làm được bài tập thực tế</span>
          </h2>
          <p className="mx-auto max-w-2xl text-base text-text-muted sm:text-lg">
            Cảm nhận thực tế từ phụ huynh và học sinh đã trải qua hành trình luyện thi cùng Sata Robo
          </p>
        </div>

        {/* Desktop: 3-col grid (only show video items) */}
        <div className="hidden gap-5 sm:grid sm:grid-cols-3">
          {videoItems.map(item => (
            <TestiCard key={item.id} item={item} onPlay={setActiveVideo} />
          ))}
        </div>

        {/* Mobile: swipe carousel — pause auto when modal is open */}
        <div className="sm:hidden">
          <MobileCarousel autoInterval={4500} accentColor="#9B6DD4" isPaused={activeVideo !== null}>
            {videoItems.map(item => (
              <TestiCard key={item.id} item={item} onPlay={setActiveVideo} />
            ))}
          </MobileCarousel>
        </div>
      </div>

      {activeVideo && <VideoModal videoId={activeVideo} onClose={() => setActiveVideo(null)} />}
    </section>
  )
}
