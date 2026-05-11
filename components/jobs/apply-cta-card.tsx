'use client'

import { Mail, Phone, MessageCircle } from 'lucide-react'
import { HR_CONTACT } from '@/lib/data/job-options'
import { obfuscateEmail } from '@/lib/utils/email-obfuscation'

interface ApplyCtaCardProps {
  job: { title: string; slug: string }
  variant: 'full' | 'compact'
}

export function ApplyCtaCard({ job, variant }: ApplyCtaCardProps) {
  const emailSubject = encodeURIComponent(
    `[Ứng tuyển ${job.title}] - <Họ tên> - <SĐT>`,
  )
  const emailBody = encodeURIComponent(
    `Kính gửi Sata Robo,\n\n` +
      `Em xin ứng tuyển vị trí ${job.title}.\n\n` +
      `Họ tên: \n` +
      `SĐT: \n` +
      `Năm sinh: \n` +
      `Học vấn: \n` +
      `Kinh nghiệm liên quan: \n\n` +
      `CV của em đính kèm trong email này.\n\n` +
      `Trân trọng,`,
  )
  const mailtoUrl = `mailto:${HR_CONTACT.email}?subject=${emailSubject}&body=${emailBody}`

  const zaloMsg = encodeURIComponent(
    `Chào ${HR_CONTACT.name}, em xin ứng tuyển vị trí "${job.title}" tại Sata Robo. Em đã gửi CV qua email ${HR_CONTACT.email}. Mong nhận được phản hồi từ anh chị.`,
  )
  const zaloUrl = `${HR_CONTACT.zaloUrl}?msg=${zaloMsg}`

  if (variant === 'compact') {
    return (
      <div className="rounded-2xl border border-orange-200 bg-gradient-to-br from-orange-50 to-purple-50 p-6">
        <h3 className="mb-4 text-lg font-bold text-gray-900">Ứng tuyển vị trí này</h3>

        <div className="mb-4 space-y-3">
          <a
            href={mailtoUrl}
            className="flex items-center gap-3 rounded-xl bg-white p-3 shadow-sm transition hover:shadow-md"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-orange-100">
              <Mail className="h-4 w-4 text-[#F97316]" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-gray-900">Gửi CV qua email</div>
              <div
                className="truncate text-xs text-gray-500"
                dangerouslySetInnerHTML={{ __html: obfuscateEmail(HR_CONTACT.email) }}
              />
            </div>
          </a>

          <a
            href={zaloUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 rounded-xl bg-white p-3 shadow-sm transition hover:shadow-md"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-100">
              <MessageCircle className="h-4 w-4 text-blue-600" />
            </div>
            <div>
              <div className="text-sm font-semibold text-gray-900">Nhắn Zalo HR</div>
              <div className="text-xs text-gray-500">{HR_CONTACT.name} · {HR_CONTACT.phone}</div>
            </div>
          </a>

          <a
            href={`tel:${HR_CONTACT.phoneRaw}`}
            className="flex items-center gap-3 rounded-xl bg-white p-3 shadow-sm transition hover:shadow-md"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-green-100">
              <Phone className="h-4 w-4 text-green-600" />
            </div>
            <div>
              <div className="text-sm font-semibold text-gray-900">Gọi trực tiếp</div>
              <div className="text-xs text-gray-500">{HR_CONTACT.phone}</div>
            </div>
          </a>
        </div>

        <p className="text-xs text-gray-400">📍 {HR_CONTACT.address}</p>
      </div>
    )
  }

  return (
    <div className="rounded-2xl border-2 border-orange-200 bg-gradient-to-br from-orange-50 via-white to-purple-50 p-8">
      <h3 className="mb-2 text-2xl font-bold text-gray-900">Quan tâm vị trí này?</h3>
      <p className="mb-6 text-gray-600">
        Gửi CV về{' '}
        <strong dangerouslySetInnerHTML={{ __html: obfuscateEmail(HR_CONTACT.email) }} /> hoặc
        nhắn Zalo {HR_CONTACT.name} ({HR_CONTACT.phone}) để được tư vấn nhanh.
      </p>

      <div className="grid gap-3 sm:grid-cols-3">
        <a
          href={mailtoUrl}
          className="flex items-center justify-center gap-2 rounded-xl bg-[#F97316] px-4 py-3 font-bold text-white transition hover:opacity-90"
        >
          <Mail className="h-5 w-5" />
          Gửi CV qua Email
        </a>

        <a
          href={zaloUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 rounded-xl bg-blue-500 px-4 py-3 font-bold text-white transition hover:opacity-90"
        >
          <MessageCircle className="h-5 w-5" />
          Chat Zalo
        </a>

        <a
          href={`tel:${HR_CONTACT.phoneRaw}`}
          className="flex items-center justify-center gap-2 rounded-xl bg-green-500 px-4 py-3 font-bold text-white transition hover:opacity-90"
        >
          <Phone className="h-5 w-5" />
          Gọi {HR_CONTACT.phone}
        </a>
      </div>

      <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <strong>Mẹo:</strong> Email mẫu đã prefill subject + nội dung cơ bản — chỉ cần thay{' '}
        {'<Họ tên>'} và {'<SĐT>'} rồi đính kèm CV.
      </div>
    </div>
  )
}
