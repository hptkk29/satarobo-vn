'use client'

import { useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Loader2, Send } from 'lucide-react'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const PHONE_VN = /^(0|\+84)[3|5|7|8|9][0-9]{8}$/

const SUBJECTS = [
  { value: 'tu-van-khoa-hoc', label: 'Tư vấn khoá học' },
  { value: 'hop-tac-b2b', label: 'Hợp tác B2B' },
  { value: 'khieu-nai', label: 'Khiếu nại' },
  { value: 'khac', label: 'Khác' },
] as const

type SubjectValue = (typeof SUBJECTS)[number]['value']

const SUBJECT_PARAM_MAP: Record<string, SubjectValue> = {
  'sata-inno-school': 'hop-tac-b2b',
  satago: 'hop-tac-b2b',
  'tu-van-khoa-hoc': 'tu-van-khoa-hoc',
  'hop-tac-b2b': 'hop-tac-b2b',
}

const SUBJECT_VALUES = ['tu-van-khoa-hoc', 'hop-tac-b2b', 'khieu-nai', 'khac'] as const

const contactSchema = z.object({
  parentName: z.string().min(2, 'Họ tên tối thiểu 2 ký tự').max(100),
  phone: z.string().regex(PHONE_VN, 'SĐT Việt Nam không hợp lệ (VD: 0912345678)'),
  email: z.string().email('Email không hợp lệ').optional().or(z.literal('')),
  // Zod v4 dùng 'error' thay vì 'required_error'
  subject: z.enum(SUBJECT_VALUES, { error: 'Vui lòng chọn chủ đề' }),
  message: z.string().max(500, 'Tối đa 500 ký tự').optional(),
  website: z.string().max(0).optional().or(z.literal('')),
})

type ContactFormValues = z.infer<typeof contactSchema>

function getCookie(name: string): string {
  if (typeof document === 'undefined') return ''
  const match = document.cookie.match(new RegExp(`(^| )${name}=([^;]+)`))
  return match?.[2] ?? ''
}

function getUrlParam(search: URLSearchParams, key: string): string {
  return search.get(key) ?? ''
}

function ContactFormInner() {
  const searchParams = useSearchParams()
  const startTimeRef = useRef<number>(Date.now())
  const [isSubmitting, setIsSubmitting] = useState(false)

  const subjectFromUrl = searchParams.get('subject') ?? ''
  const productFromUrl = searchParams.get('product')
  const defaultSubject: SubjectValue =
    SUBJECT_PARAM_MAP[subjectFromUrl] ?? 'tu-van-khoa-hoc'
  const defaultMessage = productFromUrl
    ? `Tôi quan tâm đến sản phẩm: ${productFromUrl}`
    : ''

  const form = useForm<ContactFormValues>({
    resolver: zodResolver(contactSchema),
    defaultValues: {
      parentName: '',
      phone: '',
      email: '',
      subject: defaultSubject,
      message: defaultMessage,
      website: '',
    },
  })

  const messageValue = form.watch('message') ?? ''

  async function onSubmit(values: ContactFormValues) {
    setIsSubmitting(true)

    const timeOnPage = Math.floor((Date.now() - startTimeRef.current) / 1000)
    const eventId = `lh-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const subjectLabel = SUBJECTS.find((s) => s.value === values.subject)?.label ?? values.subject
    const note = `[Subject: ${subjectLabel}]${values.message ? ' ' + values.message : ''}`

    const payload = {
      parentName: values.parentName,
      phone: values.phone,
      email: values.email || undefined,
      source: 'lien-he',
      note,
      eventId,
      timeOnPage,
      website: values.website ?? '',
      consentMarketing: true,
      landingPage: typeof window !== 'undefined' ? window.location.href : undefined,
      referrer: typeof document !== 'undefined' ? document.referrer || undefined : undefined,
      utmSource: getUrlParam(searchParams, 'utm_source') || undefined,
      utmMedium: getUrlParam(searchParams, 'utm_medium') || undefined,
      utmCampaign: getUrlParam(searchParams, 'utm_campaign') || undefined,
      utmTerm: getUrlParam(searchParams, 'utm_term') || undefined,
      utmContent: getUrlParam(searchParams, 'utm_content') || undefined,
      fbclid: getUrlParam(searchParams, 'fbclid') || undefined,
      gclid: getUrlParam(searchParams, 'gclid') || undefined,
      fbp: getCookie('_fbp') || undefined,
      fbc: getCookie('_fbc') || undefined,
    }

    try {
      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json()

      if (!res.ok || !json.ok) {
        throw new Error(json.error ?? 'Lỗi hệ thống')
      }

      toast.success('Gửi thành công!', {
        description: 'Đội ngũ Sata Robo sẽ liên hệ với bạn trong vòng 30 phút.',
      })
      form.reset({ subject: 'tu-van-khoa-hoc', parentName: '', phone: '', email: '', message: '' })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Lỗi hệ thống'
      toast.error('Gửi thất bại', { description: message })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
        {/* Honeypot — ẩn khỏi người dùng, bot sẽ fill */}
        <input type="text" {...form.register('website')} className="hidden" tabIndex={-1} autoComplete="off" />

        <div className="grid sm:grid-cols-2 gap-5">
          {/* Họ tên */}
          <FormField
            control={form.control}
            name="parentName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  Họ tên phụ huynh <span className="text-destructive">*</span>
                </FormLabel>
                <FormControl>
                  <Input placeholder="Nguyễn Văn A" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Số điện thoại */}
          <FormField
            control={form.control}
            name="phone"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  Số điện thoại <span className="text-destructive">*</span>
                </FormLabel>
                <FormControl>
                  <Input placeholder="0912 345 678" type="tel" inputMode="tel" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* Email */}
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input placeholder="email@gmail.com" type="email" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Chủ đề */}
        <FormField
          control={form.control}
          name="subject"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                Chủ đề <span className="text-destructive">*</span>
              </FormLabel>
              <Select
                value={field.value}
                onValueChange={(v) => field.onChange(v ?? 'tu-van-khoa-hoc')}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Chọn chủ đề..." />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {SUBJECTS.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Lời nhắn */}
        <FormField
          control={form.control}
          name="message"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                Lời nhắn{' '}
                <span className="text-text-muted text-xs font-normal">
                  ({messageValue.length}/500 ký tự)
                </span>
              </FormLabel>
              <FormControl>
                <Textarea
                  placeholder="Chia sẻ thêm về nhu cầu của bạn..."
                  rows={4}
                  maxLength={500}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <button
          type="submit"
          disabled={isSubmitting}
          className="btn-primary w-full justify-center text-base disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Đang gửi...
            </>
          ) : (
            <>
              <Send className="w-4 h-4" />
              Gửi tin nhắn
            </>
          )}
        </button>

        <p className="text-xs text-text-muted text-center">
          Thông tin được bảo mật tuyệt đối. Chúng tôi không bao giờ chia sẻ dữ liệu của bạn.
        </p>
      </form>
    </Form>
  )
}

// Suspense wrapper vì ContactFormInner dùng useSearchParams()
import { Suspense } from 'react'

export function ContactForm() {
  return (
    <section className="section-padding bg-white">
      <div className="container-site max-w-2xl mx-auto">
        <div className="text-center mb-10">
          <span className="badge-orange mb-3 inline-block">Gửi tin nhắn</span>
          <h2 className="heading-2 text-text-dark">
            Để lại thông tin,{' '}
            <span className="text-gradient-orange-purple">chúng tôi gọi lại</span>
          </h2>
          <p className="text-text-muted mt-3">
            Phản hồi trong vòng 30 phút trong giờ hành chính (8h – 21h hàng ngày)
          </p>
        </div>

        <div className="card-base p-6 sm:p-8">
          <Suspense fallback={<div className="h-64 animate-pulse bg-gray-100 rounded-xl" />}>
            <ContactFormInner />
          </Suspense>
        </div>
      </div>
    </section>
  )
}
