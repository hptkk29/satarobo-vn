'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Image from 'next/image'

const items = [
  {
    id: 't1',
    initials: 'NA',
    name: 'Anh Ngọc Anh',
    role: 'Phụ huynh bạn Duy Tùng · Đà Nẵng',
    quote:
      '"Con học 3 tuần, từ chỗ không biết bắt đầu từ đâu đến khi thi thử đạt 85% điểm. Điều tôi thích nhất là AI chấm bài ngay — tôi biết chắc con hiểu bài trước khi học tiếp, khác hoàn toàn so với xem YouTube."',
    videoId: 'anInoYFGrF0',
    avatarBg: '#5B2D8E',
  },
  {
    id: 't2',
    initials: 'TS',
    name: 'Anh Trường Sơn',
    role: 'Phụ huynh bạn Minh Châu · Đà Nẵng',
    quote:
      '"Ban đầu lo con học online không hiệu quả. Nhưng 27.000 đồng mỗi buổi — rẻ hơn cả nửa cốc trà sữa — mà con tiến bộ rõ rệt sau 2 tuần. Con học hào hứng và làm được bài tập thực hành rất tốt."',
    videoId: 'bqB2c7AlSfE',
    avatarBg: '#7C3AED',
  },
  {
    id: 't3',
    initials: 'MT',
    name: 'Chị Mỹ Trang',
    role: 'Phụ huynh bạn Gia Hân · Đà Nẵng',
    quote:
      '"Con thi Robotics năm ngoái không vào được vòng chung kết vì không có chiến lược. Năm nay học khóa này, con tự làm được bài tập và hiểu rõ cách sắp xếp thứ tự nhiệm vụ. Tự tin hơn hẳn khi bước vào phòng thi!"',
    videoId: '9MJFC4v8cbU',
    avatarBg: '#3D1A6E',
  },
]

function TestiCard({
  item,
  onPlay,
}: {
  item: (typeof items)[0]
  onPlay: (id: string) => void
}) {
  return (
    <article className="card-base p-5 sm:p-6" aria-label={`Đánh giá từ ${item.name}`}>
      <div className="text-yellow-400 text-sm mb-3" aria-label="5 sao">
        ★★★★★
      </div>
      <p className="text-sm sm:text-base text-text-muted leading-relaxed italic mb-4">
        {item.quote}
      </p>
      <div className="flex items-center gap-3 mb-4">
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-extrabold shrink-0"
          style={{ background: item.avatarBg }}
          aria-hidden="true"
        >
          {item.initials}
        </div>
        <div>
          <div className="font-bold text-sm text-text-dark">{item.name}</div>
          <div className="text-xs text-text-muted">{item.role}</div>
        </div>
      </div>
      <button
        type="button"
        className="relative w-full rounded-xl overflow-hidden group"
        onClick={() => onPlay(item.videoId)}
        aria-label={`Phát video cảm nhận của ${item.name}`}
      >
        <Image
          src={`https://img.youtube.com/vi/${item.videoId}/hqdefault.jpg`}
          alt={`Ảnh thumbnail video của ${item.name}`}
          width={480}
          height={270}
          className="w-full h-auto"
          loading="lazy"
          unoptimized
        />
        <div className="absolute inset-0 bg-black/30 flex items-center justify-center group-hover:bg-black/40 transition">
          <div className="w-12 h-12 bg-white/90 rounded-full flex items-center justify-center shadow-lg">
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6 text-red-600 ml-1">
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
        </div>
        <span className="absolute bottom-2 left-0 right-0 text-center text-white text-xs font-bold drop-shadow">
          Bấm để xem
        </span>
      </button>
    </article>
  )
}

function VideoModal({ videoId, onClose }: { videoId: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Video cảm nhận học viên"
    >
      <div
        className="relative w-full max-w-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="absolute -top-10 right-0 text-white text-3xl font-bold hover:text-gray-300"
          onClick={onClose}
          aria-label="Đóng video"
        >
          ×
        </button>
        <div className="relative w-full" style={{ paddingBottom: '56.25%' }}>
          <iframe
            className="absolute inset-0 w-full h-full rounded-xl"
            src={`https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1`}
            title="Video cảm nhận học viên Sata Robo"
            allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
            allowFullScreen
          />
        </div>
      </div>
    </div>
  )
}

export function Testimonials() {
  const [activeVideo, setActiveVideo] = useState<string | null>(null)
  const [activeIdx, setActiveIdx] = useState(0)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const touchStartX = useRef<number | null>(null)

  const openVideo = (videoId: string) => setActiveVideo(videoId)
  const closeVideo = useCallback(() => setActiveVideo(null), [])

  const startAuto = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current)
    if (activeVideo) return
    intervalRef.current = setInterval(() => {
      setActiveIdx(i => (i + 1) % items.length)
    }, 4500)
  }, [activeVideo])

  useEffect(() => {
    startAuto()
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [startAuto])

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX
  }

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return
    const diff = touchStartX.current - e.changedTouches[0].clientX
    if (Math.abs(diff) > 50) {
      if (diff > 0) {
        setActiveIdx(i => (i + 1) % items.length)
      } else {
        setActiveIdx(i => (i - 1 + items.length) % items.length)
      }
      startAuto()
    }
    touchStartX.current = null
  }

  return (
    <section id="testimonials" aria-labelledby="testi-heading" className="section-padding bg-white">
      <div className="container-site">
        <div className="text-center mb-10 sm:mb-14">
          <div className="badge-orange mb-4">PHỤ HUYNH VÀ HỌC SINH NÓI GÌ</div>
          <h2 id="testi-heading" className="heading-2 mb-3">
            Hàng trăm học sinh đã tham gia khóa học
            <br />
            <span className="text-gradient-orange-purple">và hào hứng làm được bài tập thực tế</span>
          </h2>
          <p className="text-base sm:text-lg text-text-muted max-w-2xl mx-auto">
            Cảm nhận thực tế từ phụ huynh và học sinh đã trải qua hành trình luyện thi cùng Sata Robo
          </p>
        </div>

        {/* Desktop: 3-col grid */}
        <div className="hidden md:grid grid-cols-3 gap-5 sm:gap-6">
          {items.map((item) => (
            <TestiCard key={item.id} item={item} onPlay={openVideo} />
          ))}
        </div>

        {/* Mobile: carousel */}
        <div
          className="md:hidden overflow-hidden"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          <div
            className="flex transition-transform duration-500 ease-in-out"
            style={{ transform: `translateX(-${activeIdx * 100}%)` }}
          >
            {items.map((item) => (
              <div key={item.id} className="min-w-full px-1">
                <TestiCard item={item} onPlay={openVideo} />
              </div>
            ))}
          </div>
          <div className="flex justify-center gap-2 mt-4">
            {items.map((_, i) => (
              <button
                key={i}
                aria-label={`Testimonial ${i + 1}`}
                onClick={() => { setActiveIdx(i); startAuto() }}
                className={`h-2 rounded-full transition-all duration-300 ${
                  i === activeIdx ? 'w-6 bg-primary-purple' : 'w-2 bg-gray-300'
                }`}
              />
            ))}
          </div>
        </div>
      </div>

      {activeVideo && <VideoModal videoId={activeVideo} onClose={closeVideo} />}
    </section>
  )
}
