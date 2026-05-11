import Link from 'next/link'
import { MapPin, Clock, Users, Banknote } from 'lucide-react'
import { formatSalaryRange, DEPARTMENTS, LOCATIONS, JOB_TYPES } from '@/lib/data/job-options'

interface JobCardProps {
  job: {
    slug: string
    title: string
    department: string | null
    location: string | null
    type: string | null
    salaryMin: number | null
    salaryMax: number | null
    salaryNote: string | null
    openings: number
    closesAt: Date | null
    createdAt: Date
  }
}

export function JobCard({ job }: JobCardProps) {
  const deptLabel = DEPARTMENTS.find((d) => d.value === job.department)?.label ?? job.department ?? ''
  const locLabel = LOCATIONS.find((l) => l.value === job.location)?.label ?? job.location ?? ''
  const typeLabel = JOB_TYPES.find((t) => t.value === job.type)?.label ?? job.type ?? ''
  const salary = formatSalaryRange(job.salaryMin, job.salaryMax, job.salaryNote)

  const isClosingSoon =
    job.closesAt && new Date(job.closesAt).getTime() - Date.now() < 7 * 24 * 60 * 60 * 1000

  return (
    <Link
      href={`/tuyen-dung/${job.slug}`}
      className="group block rounded-2xl border border-gray-200 bg-white p-6 transition hover:border-[#F97316] hover:shadow-lg"
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-orange-100 px-2.5 py-0.5 text-xs font-semibold text-orange-700">
          {deptLabel}
        </span>
        <span className="rounded-full border border-gray-200 px-2.5 py-0.5 text-xs font-semibold text-gray-600">
          {typeLabel}
        </span>
        {isClosingSoon && (
          <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-600">
            Sắp đóng
          </span>
        )}
      </div>

      <h3 className="mb-3 line-clamp-2 text-lg font-bold text-gray-900 group-hover:text-[#F97316] transition-colors">
        {job.title}
      </h3>

      <div className="mb-4 space-y-1.5 text-sm text-gray-500">
        <div className="flex items-center gap-2">
          <MapPin className="h-4 w-4 shrink-0" />
          <span>{locLabel}</span>
        </div>
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 shrink-0" />
          <span>{job.openings} chỉ tiêu</span>
        </div>
        {job.closesAt && (
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 shrink-0" />
            <span>Hạn nộp: {new Date(job.closesAt).toLocaleDateString('vi-VN')}</span>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between border-t border-gray-100 pt-4">
        <div className="flex items-center gap-1.5 font-bold text-[#F97316]">
          <Banknote className="h-4 w-4" />
          <span>{salary}</span>
        </div>
        <span className="text-sm font-semibold text-[#7C3AED] opacity-0 transition-opacity group-hover:opacity-100">
          Xem chi tiết →
        </span>
      </div>
    </Link>
  )
}
