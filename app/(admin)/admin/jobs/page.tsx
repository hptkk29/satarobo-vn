import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import { JobsAdminTable } from '@/components/admin/jobs/jobs-admin-table'
import type { JobStatus } from '@prisma/client'

const VALID_STATUSES: JobStatus[] = ['DRAFT', 'OPEN', 'CLOSED', 'ON_HOLD', 'PAUSED']

const STATUS_TABS: { value: string; label: string }[] = [
  { value: 'all', label: 'Tất cả' },
  { value: 'OPEN', label: 'Đang tuyển' },
  { value: 'DRAFT', label: 'Bản nháp' },
  { value: 'CLOSED', label: 'Đã đóng' },
  { value: 'ON_HOLD', label: 'Tạm dừng' },
]

interface SearchParams {
  searchParams: Promise<{ status?: string }>
}

export default async function AdminJobsPage({ searchParams }: SearchParams) {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const canEdit = ['SUPER_ADMIN', 'MANAGER'].includes(session.user.role)

  const sp = await searchParams
  const statusParam = sp.status as JobStatus | undefined
  const statusFilter = statusParam && VALID_STATUSES.includes(statusParam) ? statusParam : undefined
  const activeTab = statusFilter ?? 'all'

  let jobs: Array<{
    id: string
    slug: string
    title: string
    department: string | null
    status: JobStatus
    openings: number
    closesAt: Date | null
    updatedAt: Date
    author: { name: string | null; email: string } | null
  }> = []

  try {
    jobs = await db.jobPosting.findMany({
      where: statusFilter ? { status: statusFilter } : {},
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        slug: true,
        title: true,
        department: true,
        status: true,
        openings: true,
        closesAt: true,
        updatedAt: true,
        author: { select: { name: true, email: true } },
      },
    })
  } catch { /* empty DB */ }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tuyển dụng</h1>
          <p className="mt-1 text-sm text-gray-500">{jobs.length} tin đăng</p>
        </div>
        {canEdit && (
          <Link
            href="/jobs/new"
            className="inline-flex items-center gap-2 rounded-lg bg-[#7C3AED] px-4 py-2 text-sm font-bold text-white hover:opacity-90"
          >
            <Plus className="h-4 w-4" />
            Tạo JD mới
          </Link>
        )}
      </div>

      {/* Status tabs */}
      <div className="mb-4 flex gap-1 overflow-x-auto">
        {STATUS_TABS.map((tab) => (
          <Link
            key={tab.value}
            href={tab.value === 'all' ? '/jobs' : `/jobs?status=${tab.value}`}
            className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
              activeTab === tab.value
                ? 'bg-[#7C3AED] text-white'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </div>

      <JobsAdminTable jobs={jobs} canEdit={canEdit} />
    </div>
  )
}
