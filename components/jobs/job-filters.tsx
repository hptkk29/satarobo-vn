'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { DEPARTMENTS, LOCATIONS, JOB_TYPES } from '@/lib/data/job-options'

interface JobFiltersProps {
  currentFilters: {
    department?: string
    location?: string
    type?: string
  }
}

export function JobFilters({ currentFilters }: JobFiltersProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const handleChange = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString())
    if (value === 'all') {
      params.delete(key)
    } else {
      params.set(key, value)
    }
    router.push(`/tuyen-dung?${params.toString()}`)
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <select
        value={currentFilters.department ?? 'all'}
        onChange={(e) => handleChange('department', e.target.value)}
        className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[#7C3AED] focus:outline-none focus:ring-2 focus:ring-[#7C3AED]/20"
      >
        <option value="all">Tất cả phòng ban</option>
        {DEPARTMENTS.map((d) => (
          <option key={d.value} value={d.value}>
            {d.label}
          </option>
        ))}
      </select>

      <select
        value={currentFilters.location ?? 'all'}
        onChange={(e) => handleChange('location', e.target.value)}
        className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[#7C3AED] focus:outline-none focus:ring-2 focus:ring-[#7C3AED]/20"
      >
        <option value="all">Tất cả địa điểm</option>
        {LOCATIONS.map((l) => (
          <option key={l.value} value={l.value}>
            {l.label}
          </option>
        ))}
      </select>

      <select
        value={currentFilters.type ?? 'all'}
        onChange={(e) => handleChange('type', e.target.value)}
        className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[#7C3AED] focus:outline-none focus:ring-2 focus:ring-[#7C3AED]/20"
      >
        <option value="all">Tất cả hình thức</option>
        {JOB_TYPES.map((t) => (
          <option key={t.value} value={t.value}>
            {t.label}
          </option>
        ))}
      </select>
    </div>
  )
}
