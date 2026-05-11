import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { JobForm } from '@/components/admin/jobs/job-form'
import { createJobAction } from '@/app/(admin)/admin/jobs/actions'

export default async function NewJobPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  if (!['SUPER_ADMIN', 'MANAGER'].includes(session.user.role)) redirect('/admin/jobs')

  return (
    <div>
      <div className="mb-6">
        <Link href="/admin/jobs" className="mb-3 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
          <ChevronLeft className="h-4 w-4" /> Quay lại danh sách
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Tạo tin tuyển dụng mới</h1>
      </div>

      <JobForm action={createJobAction} mode="create" />
    </div>
  )
}
