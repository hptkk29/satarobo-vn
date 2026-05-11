import { MapPin, Clock, Users, Briefcase, Banknote } from 'lucide-react'
import { formatSalaryRange, DEPARTMENTS, LOCATIONS, JOB_TYPES } from '@/lib/data/job-options'

interface JobMetaProps {
  job: {
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

export function JobMeta({ job }: JobMetaProps) {
  const deptLabel = DEPARTMENTS.find((d) => d.value === job.department)?.label ?? job.department ?? ''
  const locLabel = LOCATIONS.find((l) => l.value === job.location)?.label ?? job.location ?? ''
  const typeLabel = JOB_TYPES.find((t) => t.value === job.type)?.label ?? job.type ?? ''
  const salary = formatSalaryRange(job.salaryMin, job.salaryMax, job.salaryNote)

  const items = [
    { icon: Briefcase, label: deptLabel, color: 'text-purple-600 bg-purple-50' },
    { icon: MapPin, label: locLabel, color: 'text-blue-600 bg-blue-50' },
    { icon: Clock, label: typeLabel, color: 'text-gray-600 bg-gray-50' },
    { icon: Banknote, label: salary, color: 'text-orange-600 bg-orange-50' },
    { icon: Users, label: `${job.openings} chỉ tiêu`, color: 'text-green-600 bg-green-50' },
    ...(job.closesAt
      ? [
          {
            icon: Clock,
            label: `Hạn nộp: ${new Date(job.closesAt).toLocaleDateString('vi-VN')}`,
            color: 'text-red-600 bg-red-50',
          },
        ]
      : []),
  ]

  return (
    <div className="flex flex-wrap gap-2 py-4">
      {items.map((item, i) => {
        const Icon = item.icon
        return (
          <span
            key={i}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium ${item.color}`}
          >
            <Icon className="h-3.5 w-3.5" />
            {item.label}
          </span>
        )
      })}
    </div>
  )
}
