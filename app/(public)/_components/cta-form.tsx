'use client'

import { useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { CheckCircle2, ChevronDown, Loader2, MessageCircle, Phone, User } from 'lucide-react'

const PHONE_VN = /^(0|\+84)[3|5|7|8|9][0-9]{8}$/

const COURSE_OPTIONS = [
  { value: 'online-robosim-r1', label: 'Luyện thi RoboSim Online — Bảng R1 (Tiểu học)' },
  { value: 'online-robosim-r2', label: 'Luyện thi RoboSim Online — Bảng R2 (THCS)' },
  { value: 'offline-robosim-master', label: 'Lập trình Robot Offline — Sata1 (lớp 3-5)' },
  { value: 'offline-robot-arena', label: 'Lập trình Robot Offline — Sata2 (lớp 6-9)' },
  { value: 'inno-school', label: 'Sata Inno School (cho trường học)' },
  { value: 'satago', label: 'SATAGO Du lịch giáo dục' },
]

const formSchema = z.object({
  parentName: z.string().min(2, 'Vui lòng nhập họ tên (tối thiểu 2 ký tự)'),
  phone: z.string().regex(PHONE_VN, 'Số điện thoại chưa đúng định dạng'),
  courseInterest: z.string().optional(),
  consentMarketing: z.boolean().refine(Boolean, 'Vui lòng xác nhận đồng ý nhận thông tin'),
  website: z.string().max(0).optional().or(z.literal('')),
})

type FormValues = z.infer<typeof formSchema>

function getCookie(name: string): string | undefined {
  if (typeof document === 'undefined') return undefined
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`))
  return match ? decodeURIComponent(match[1]) : undefined
}

function getUtmParams(): Record<string, string | undefined> {
  if (typeof window === 'undefined') return {}
  const p = new URLSearchParams(window.location.search)
  return {
    utmSource: p.get('utm_source') ?? undefined,
    utmMedium: p.get('utm_medium') ?? undefined,
    utmCampaign: p.get('utm_campaign') ?? undefined,
    utmTerm: p.get('utm_term') ?? undefined,
    utmContent: p.get('utm_content') ?? undefined,
    fbclid: p.get('fbclid') ?? undefined,
    gclid: p.get('gclid') ?? undefined,
    fbp: getCookie('_fbp'),
    fbc: getCookie('_fbc') ?? p.get('fbclid') ?? undefined,
  }
}

export function CtaForm() {
  const [submitted, setSubmitted] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const pageLoadTime = useRef(Date.now())

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { courseInterest: '', consentMarketing: true, website: '' },
  })

  const onSubmit = async (values: FormValues) => {
    setServerError(null)
    try {
      const timeOnPage = Math.floor((Date.now() - pageLoadTime.current) / 1000)
      const eventId = `hp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

      const body = {
        parentName: values.parentName,
        phone: values.phone,
        source: values.courseInterest || 'homepage-cta',
        website: values.website ?? '',
        timeOnPage,
        eventId,
        consentMarketing: values.consentMarketing,
        landingPage: window.location.href,
        referrer: document.referrer || undefined,
        ...getUtmParams(),
      }

      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      const data = (await res.json()) as { ok: boolean; error?: string }
      if (!res.ok || !data.ok) {
        setServerError(data.error ?? 'Có lỗi xảy ra, vui lòng thử lại')
        return
      }
      setSubmitted(true)
    } catch {
      setServerError('Không thể kết nối. Vui lòng thử lại hoặc liên hệ Zalo.')
    }
  }

  if (submitted) {
    return (
      <div className="text-center py-8">
        <div className="mb-4 flex justify-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-500/20">
            <CheckCircle2 className="h-8 w-8 text-green-400" />
          </div>
        </div>
        <h3 className="text-xl font-black text-white mb-2">Đăng ký thành công!</h3>
        <p className="text-white/70 text-sm mb-6">
          Sata Robo sẽ liên hệ xác nhận trong vòng 30 phút (giờ hành chính).
        </p>
        <a
          href="https://zalo.me/0818823720"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-xl bg-[#0068FF] px-6 py-3 font-bold text-white shadow-lg transition hover:scale-105 active:scale-95"
        >
          <MessageCircle className="h-5 w-5" aria-hidden="true" />
          Chat Zalo để được tư vấn ngay
        </a>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
      {/* Honeypot */}
      <input
        type="text"
        {...register('website')}
        className="sr-only"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
      />

      {/* Course interest */}
      <div>
        <label
          htmlFor="hp-courseInterest"
          className="mb-1.5 block text-sm font-bold text-white"
        >
          Khoá học quan tâm
        </label>
        <div className="relative">
          <select
            id="hp-courseInterest"
            {...register('courseInterest')}
            className="w-full appearance-none rounded-xl border border-white/20 bg-white/10 px-4 py-3 text-sm text-white transition focus:border-white focus:outline-none focus:ring-2 focus:ring-white/20 [&>option]:text-gray-900 [&>option]:bg-white"
          >
            <option value="">-- Chọn khoá học hoặc nhờ tư vấn --</option>
            {COURSE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <ChevronDown
            className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/60"
            aria-hidden="true"
          />
        </div>
      </div>

      {/* Parent name */}
      <div>
        <label htmlFor="hp-parentName" className="mb-1.5 block text-sm font-bold text-white">
          Họ tên phụ huynh <span className="text-orange-300" aria-hidden="true">*</span>
        </label>
        <div className="relative">
          <User
            className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/50"
            aria-hidden="true"
          />
          <input
            id="hp-parentName"
            type="text"
            autoComplete="name"
            placeholder="Nguyễn Văn A"
            {...register('parentName')}
            className={`w-full rounded-xl border py-3 pl-9 pr-4 text-sm text-white placeholder-white/40 bg-white/10 transition focus:outline-none focus:ring-2 ${
              errors.parentName
                ? 'border-red-400 focus:border-red-400 focus:ring-red-400/20'
                : 'border-white/20 focus:border-white focus:ring-white/20'
            }`}
          />
        </div>
        {errors.parentName && (
          <p className="mt-1 text-xs font-semibold text-red-300">{errors.parentName.message}</p>
        )}
      </div>

      {/* Phone */}
      <div>
        <label htmlFor="hp-phone" className="mb-1.5 block text-sm font-bold text-white">
          Số điện thoại <span className="text-orange-300" aria-hidden="true">*</span>
        </label>
        <div className="relative">
          <Phone
            className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/50"
            aria-hidden="true"
          />
          <input
            id="hp-phone"
            type="tel"
            autoComplete="tel"
            placeholder="09xxxxxxxx"
            {...register('phone')}
            className={`w-full rounded-xl border py-3 pl-9 pr-4 text-sm text-white placeholder-white/40 bg-white/10 transition focus:outline-none focus:ring-2 ${
              errors.phone
                ? 'border-red-400 focus:border-red-400 focus:ring-red-400/20'
                : 'border-white/20 focus:border-white focus:ring-white/20'
            }`}
          />
        </div>
        {errors.phone && (
          <p className="mt-1 text-xs font-semibold text-red-300">{errors.phone.message}</p>
        )}
      </div>

      {/* Consent */}
      <label className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/80 cursor-pointer">
        <input
          type="checkbox"
          {...register('consentMarketing')}
          className="mt-0.5 h-4 w-4 rounded border-gray-300 text-primary-orange focus:ring-primary-orange"
        />
        <span>
          Đồng ý nhận thông tin tư vấn, lịch học và ưu đãi từ Sata Robo.
          {errors.consentMarketing && (
            <span className="mt-1 block text-xs font-semibold text-red-300">
              {errors.consentMarketing.message}
            </span>
          )}
        </span>
      </label>

      {/* Server error */}
      {serverError && (
        <div className="rounded-xl border border-red-400/20 bg-red-500/10 p-3 text-sm text-red-300">
          {serverError}
        </div>
      )}

      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full rounded-2xl py-4 px-5 font-extrabold text-base text-white transition hover:opacity-90 hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
        style={{
          background: 'linear-gradient(135deg, #F97316, #FBBF24)',
          boxShadow: '0 8px 24px rgba(249,115,22,0.4)',
        }}
      >
        {isSubmitting ? (
          <span className="flex items-center justify-center gap-2">
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
            Đang gửi...
          </span>
        ) : (
          'Đăng ký nhận tư vấn miễn phí'
        )}
      </button>

      <p className="text-center text-xs text-white/50">
        Thông tin chỉ dùng để liên hệ tư vấn. Sata Robo không chia sẻ với bên thứ ba.
      </p>
    </form>
  )
}
