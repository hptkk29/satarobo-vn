'use client'

import { useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  CheckCircle2,
  ChevronDown,
  Loader2,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  User,
} from 'lucide-react'
import { courseGroups, CONSULT_OPTION, type Course } from '../_data/courses-pricing'
import { locations } from '../_data/locations'

const PHONE_VN = /^(0|\+84)[3|5|7|8|9][0-9]{8}$/

const formSchema = z.object({
  childName: z.string().max(100).optional(),
  childAge: z.number().int().min(3, 'Tuá»•i tá»‘i thiá»ƒu 3').max(18, 'Tuá»•i tá»‘i Ä‘a 18').optional(),
  email: z.string().email('Email khÃ´ng há»£p lá»‡').optional().or(z.literal('')),
  consentMarketing: z.boolean().refine(Boolean, 'Vui lÃ²ng xÃ¡c nháº­n Ä‘á»“ng Ã½ nháº­n thÃ´ng tin'),
  parentName: z.string().min(2, 'Vui lòng nhập họ tên (tối thiểu 2 ký tự)'),
  phone: z.string().regex(PHONE_VN, 'Số điện thoại chưa đúng định dạng'),
  courseValue: z.string().optional(),
  locationId: z.string().optional(),
  // Honeypot — bot fills this, real users leave empty
  website: z.string().max(0).optional().or(z.literal('')),
})

type FormValues = z.infer<typeof formSchema>

const allCourses = courseGroups.flatMap(g => g.courses)

const courseOptions = [
  ...allCourses.map(c => ({ value: c.value, label: c.shortName, grade: c.grade })),
  { value: CONSULT_OPTION.value, label: CONSULT_OPTION.name, grade: '' },
]

function getCoursePrice(course: Course): number {
  const c = course as { earlyBirdPrice?: number; comboPrice?: number; fixedPrice?: number }
  return c.earlyBirdPrice ?? c.comboPrice ?? c.fixedPrice ?? 0
}

function getCourseListPrice(course: Course): number {
  const c = course as { listPrice?: number }
  return c.listPrice ?? 0
}

function getSavedAmount(course: Course): number {
  const c = course as { savedAmount?: number }
  if (c.savedAmount) return c.savedAmount
  const main = getCoursePrice(course)
  const list = getCourseListPrice(course)
  return list > main ? list - main : 0
}

function CourseDetailBox({ value }: { value: string }) {
  const course = allCourses.find(c => c.value === value)
  if (!course) return null

  const mainPrice = getCoursePrice(course)
  const listPrice = getCourseListPrice(course)
  const savedAmount = getSavedAmount(course)

  return (
    <div className="rounded-2xl border border-primary-orange/20 bg-soft-cream p-4">
      <div className="mb-0.5 font-bold text-text-dark">{course.displayName}</div>
      <div className="mb-2 text-xs text-text-muted">
        {course.grade} · {course.sessions} buổi · {course.totalDuration}
      </div>
      <div className="flex items-baseline gap-2">
        {mainPrice > 0 && (
          <span className="text-xl font-black text-primary-orange">
            {mainPrice.toLocaleString('vi-VN')}đ
          </span>
        )}
        {listPrice > 0 && mainPrice < listPrice && (
          <span className="text-sm text-text-muted line-through">
            {listPrice.toLocaleString('vi-VN')}đ
          </span>
        )}
      </div>
      {savedAmount > 0 && (
        <div className="mt-1 text-xs font-bold text-success">
          Tiết kiệm {savedAmount.toLocaleString('vi-VN')}đ
        </div>
      )}
      {course.note && (
        <p className="mt-2 text-xs leading-relaxed text-text-muted">{course.note}</p>
      )}
    </div>
  )
}

function ErrorText({ children }: { children: React.ReactNode }) {
  return <p className="mt-1 text-xs font-semibold text-urgent">{children}</p>
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

function getCookie(name: string): string | undefined {
  if (typeof document === 'undefined') return undefined
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`))
  return match ? decodeURIComponent(match[1]) : undefined
}

export function RegistrationForm() {
  const [submitted, setSubmitted] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const pageLoadTime = useRef(Date.now())

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { courseValue: '', locationId: '', email: '', consentMarketing: true, website: '' },
  })

  const courseValue = watch('courseValue')

  // Pick up course selection from roadmap / popup via CustomEvent + sessionStorage
  useEffect(() => {
    const onSelected = (e: Event) => {
      const value = (e as CustomEvent<string>).detail
      setValue('courseValue', value, { shouldDirty: true })
    }
    window.addEventListener('sata-course-selected', onSelected)
    const stored = sessionStorage.getItem('sata-course-selected')
    if (stored) setValue('courseValue', stored, { shouldDirty: true })
    return () => window.removeEventListener('sata-course-selected', onSelected)
  }, [setValue])

  const onSubmit = async (values: FormValues) => {
    setServerError(null)
    try {
      const timeOnPage = Math.floor((Date.now() - pageLoadTime.current) / 1000)
      const eventId = `ltr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      const selectedLocation = locations.find(l => String(l.id) === values.locationId)
      const locationName = selectedLocation?.name
      const noteText = locationName ? `Cơ sở mong muốn: ${locationName}` : undefined

      const body = {
        parentName: values.parentName,
        childName: values.childName,
        childAge: values.childAge,
        phone: values.phone,
        email: values.email,
        centerId: selectedLocation?.centerId,
        source: values.courseValue || CONSULT_OPTION.value,
        website: values.website ?? '',
        timeOnPage,
        eventId,
        consentMarketing: values.consentMarketing,
        note: noteText,
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
      <section id="registration-form" className="section-padding bg-soft-cream">
        <div className="container-site">
          <div className="mx-auto max-w-md text-center">
            <div className="mb-4 flex justify-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-success/15">
                <CheckCircle2 className="h-8 w-8 text-success" />
              </div>
            </div>
            <h2 className="mb-2 text-xl font-black text-text-dark">Đăng ký thành công!</h2>
            <p className="mb-6 text-sm leading-relaxed text-text-muted">
              Sata Robo sẽ liên hệ xác nhận trong vòng 30 phút (giờ hành chính).
              <br />
              Bạn cũng có thể nhắn Zalo để được hỗ trợ ngay.
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
        </div>
      </section>
    )
  }

  const showCourseDetail =
    courseValue && courseValue !== CONSULT_OPTION.value && courseValue !== ''

  return (
    <section
      id="registration-form"
      className="section-padding bg-soft-cream"
      aria-labelledby="form-heading"
    >
      <div className="container-site">
        <div className="mx-auto max-w-2xl">
          <div className="mb-8 text-center sm:mb-10">
            <div className="badge-orange mb-4">
              <Phone className="h-4 w-4" aria-hidden="true" />
              ĐĂNG KÝ NHẬN TƯ VẤN
            </div>
            <h2 id="form-heading" className="heading-2 mb-3 text-text-dark">
              Nhận tư vấn miễn phí
              <br />
              <span className="text-gradient-orange-purple">trong vòng 30 phút</span>
            </h2>
            <p className="text-sm text-text-muted sm:text-base">
              Để lại thông tin — tư vấn viên sẽ gọi lại xác nhận lộ trình, lớp và lịch học phù hợp nhất.
            </p>
          </div>

          <div className="rounded-3xl border border-gray-100 bg-white p-6 shadow-card sm:p-8">
            <form onSubmit={handleSubmit(onSubmit)} noValidate>
              {/* Honeypot — hidden from real users */}
              <input
                type="text"
                {...register('website')}
                className="sr-only"
                tabIndex={-1}
                autoComplete="off"
                aria-hidden="true"
              />

              {/* Course */}
              <div className="mb-4">
                <label
                  htmlFor="courseValue"
                  className="mb-1.5 block text-sm font-bold text-text-dark"
                >
                  Khóa học quan tâm
                </label>
                <div className="relative">
                  <select
                    id="courseValue"
                    {...register('courseValue')}
                    className="w-full appearance-none rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-text-dark transition focus:border-primary-orange focus:outline-none focus:ring-2 focus:ring-primary-orange/20"
                  >
                    <option value="">-- Chọn khóa học hoặc nhờ tư vấn --</option>
                    {courseOptions.map(opt => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                        {opt.grade ? ` (${opt.grade})` : ''}
                      </option>
                    ))}
                  </select>
                  <ChevronDown
                    className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted"
                    aria-hidden="true"
                  />
                </div>
              </div>

              {/* Course detail */}
              {showCourseDetail && (
                <div className="mb-4">
                  <CourseDetailBox value={courseValue!} />
                </div>
              )}

              {/* Parent name */}
              <div className="mb-4">
                <label
                  htmlFor="parentName"
                  className="mb-1.5 block text-sm font-bold text-text-dark"
                >
                  Họ tên phụ huynh <span className="text-urgent" aria-hidden="true">*</span>
                </label>
                <div className="relative">
                  <User
                    className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted"
                    aria-hidden="true"
                  />
                  <input
                    id="parentName"
                    type="text"
                    autoComplete="name"
                    placeholder="Nguyễn Văn A"
                    {...register('parentName')}
                    className={`w-full rounded-xl border py-3 pl-9 pr-4 text-sm text-text-dark transition focus:outline-none focus:ring-2 ${
                      errors.parentName
                        ? 'border-urgent focus:border-urgent focus:ring-urgent/20'
                        : 'border-gray-200 focus:border-primary-orange focus:ring-primary-orange/20'
                    }`}
                  />
                </div>
                {errors.parentName && <ErrorText>{errors.parentName.message}</ErrorText>}
              </div>

              <div className="mb-4 grid gap-4 sm:grid-cols-[1fr_8rem]">
                <div>
                  <label
                    htmlFor="childName"
                    className="mb-1.5 block text-sm font-bold text-text-dark"
                  >
                    Tên con
                  </label>
                  <div className="relative">
                    <User
                      className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted"
                      aria-hidden="true"
                    />
                    <input
                      id="childName"
                      type="text"
                      autoComplete="off"
                      placeholder="Tên bé"
                      {...register('childName')}
                      className="w-full rounded-xl border border-gray-200 py-3 pl-9 pr-4 text-sm text-text-dark transition focus:border-primary-orange focus:outline-none focus:ring-2 focus:ring-primary-orange/20"
                    />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="childAge"
                    className="mb-1.5 block text-sm font-bold text-text-dark"
                  >
                    Tuổi
                  </label>
                  <input
                    id="childAge"
                    type="number"
                    min={3}
                    max={18}
                    inputMode="numeric"
                    placeholder="9"
                    {...register('childAge', {
                      setValueAs: value => value === '' ? undefined : Number(value),
                    })}
                    className={`w-full rounded-xl border py-3 px-4 text-sm text-text-dark transition focus:outline-none focus:ring-2 ${
                      errors.childAge
                        ? 'border-urgent focus:border-urgent focus:ring-urgent/20'
                        : 'border-gray-200 focus:border-primary-orange focus:ring-primary-orange/20'
                    }`}
                  />
                  {errors.childAge && <ErrorText>{errors.childAge.message}</ErrorText>}
                </div>
              </div>

              {/* Phone */}
              <div className="mb-4">
                <label
                  htmlFor="phone"
                  className="mb-1.5 block text-sm font-bold text-text-dark"
                >
                  Số điện thoại <span className="text-urgent" aria-hidden="true">*</span>
                </label>
                <div className="relative">
                  <Phone
                    className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted"
                    aria-hidden="true"
                  />
                  <input
                    id="phone"
                    type="tel"
                    autoComplete="tel"
                    placeholder="09xxxxxxxx"
                    {...register('phone')}
                    className={`w-full rounded-xl border py-3 pl-9 pr-4 text-sm text-text-dark transition focus:outline-none focus:ring-2 ${
                      errors.phone
                        ? 'border-urgent focus:border-urgent focus:ring-urgent/20'
                        : 'border-gray-200 focus:border-primary-orange focus:ring-primary-orange/20'
                    }`}
                  />
                </div>
                {errors.phone && <ErrorText>{errors.phone.message}</ErrorText>}
              </div>

              <div className="mb-4">
                <label
                  htmlFor="email"
                  className="mb-1.5 block text-sm font-bold text-text-dark"
                >
                  Email
                </label>
                <div className="relative">
                  <Mail
                    className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted"
                    aria-hidden="true"
                  />
                  <input
                    id="email"
                    type="email"
                    autoComplete="email"
                    placeholder="phuc@satarobo.vn"
                    {...register('email')}
                    className={`w-full rounded-xl border py-3 pl-9 pr-4 text-sm text-text-dark transition focus:outline-none focus:ring-2 ${
                      errors.email
                        ? 'border-urgent focus:border-urgent focus:ring-urgent/20'
                        : 'border-gray-200 focus:border-primary-orange focus:ring-primary-orange/20'
                    }`}
                  />
                </div>
                {errors.email && <ErrorText>{errors.email.message}</ErrorText>}
              </div>

              {/* Location */}
              <div className="mb-6">
                <label
                  htmlFor="locationId"
                  className="mb-1.5 block text-sm font-bold text-text-dark"
                >
                  Cơ sở gần nhà
                </label>
                <div className="relative">
                  <MapPin
                    className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted"
                    aria-hidden="true"
                  />
                  <select
                    id="locationId"
                    {...register('locationId')}
                    className="w-full appearance-none rounded-xl border border-gray-200 bg-white py-3 pl-9 pr-8 text-sm text-text-dark transition focus:border-primary-orange focus:outline-none focus:ring-2 focus:ring-primary-orange/20"
                  >
                    <option value="">-- Chưa chắc, nhờ tư vấn --</option>
                    {locations.map(loc => (
                      <option key={loc.id} value={String(loc.id)}>
                        {loc.name} — {loc.address}
                      </option>
                    ))}
                  </select>
                  <ChevronDown
                    className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted"
                    aria-hidden="true"
                  />
                </div>
              </div>

              <label className="mb-4 flex items-start gap-3 rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 text-sm text-text-dark">
                <input
                  type="checkbox"
                  {...register('consentMarketing')}
                  className="mt-0.5 h-4 w-4 rounded border-gray-300 text-primary-orange focus:ring-primary-orange"
                />
                <span>
                  Đồng ý nhận thông tin tư vấn, lịch học và ưu đãi từ Sata Robo.
                  {errors.consentMarketing && (
                    <span className="mt-1 block text-xs font-semibold text-urgent">
                      {errors.consentMarketing.message}
                    </span>
                  )}
                </span>
              </label>

              {/* Server error */}
              {serverError && (
                <div className="mb-4 rounded-xl border border-urgent/20 bg-urgent/10 p-3 text-sm text-urgent">
                  {serverError}
                </div>
              )}

              <button
                type="submit"
                disabled={isSubmitting}
                className="btn-primary w-full disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
                    Đang gửi...
                  </>
                ) : (
                  'Đăng ký nhận tư vấn miễn phí'
                )}
              </button>

              <p className="mt-3 text-center text-xs text-text-muted">
                Thông tin chỉ dùng để liên hệ tư vấn. Sata Robo không chia sẻ với bên thứ ba.
              </p>
            </form>
          </div>
        </div>
      </div>
    </section>
  )
}
