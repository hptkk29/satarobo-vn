import { auth } from '@/lib/auth'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft, ExternalLink } from 'lucide-react'
import { db } from '@/lib/db'
import { JobForm } from '@/components/admin/jobs/job-form'
import { updateJobAction } from '@/app/(admin)/admin/jobs/actions'

export default async function EditJobPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await auth()
  if (!session?.user) redirect('/login')
  if (!['SUPER_ADMIN', 'MANAGER'].includes(session.user.role)) redirect('/admin/jobs')

  const { id } = await params
  const job = await db.jobPosting.findUnique({ where: { id } })
  if (!job) notFound()

  const boundAction = updateJobAction.bind(null, job.id)

  return (
    <div>
      <div className="mb-6">
        <Link href="/admin/jobs" className="mb-3 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
          <ChevronLeft className="h-4 w-4" /> Quay lại danh sách
        </Link>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-gray-900">Sửa: {job.title}</h1>
          <Link
            href={`/tuyen-dung/${job.slug}`}
            target="_blank"
            className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50"
          >
            <ExternalLink className="h-3.5 w-3.5" /> Xem public
          </Link>
        </div>
      </div>

      <JobForm
        action={boundAction}
        mode="edit"
        initialData={{
          slug: job.slug,
          title: job.title,
          department: job.department ?? '',
          location: job.location ?? 'danang',
          type: job.type ?? 'fulltime',
          description: job.description,
          requirements: job.requirements ?? '',
          benefits: job.benefits ?? '',
          salaryMin: job.salaryMin,
          salaryMax: job.salaryMax,
          salaryNote: job.salaryNote,
          status: job.status as never,
          openings: job.openings,
          closesAt: job.closesAt,
        }}
      />
    </div>
  )
}
