'use client'

import { useEffect, useTransition } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/navigation'
import { jobCreateSchema, type JobCreateInput } from '@/lib/validators/job'
import { DEPARTMENTS, LOCATIONS, JOB_TYPES, JOB_STATUS } from '@/lib/data/job-options'
import { Loader2 } from 'lucide-react'

function slugify(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 100)
}

interface JobFormProps {
  action: (data: JobCreateInput) => Promise<{ ok: boolean; error?: string; id?: string }>
  mode: 'create' | 'edit'
  initialData?: Partial<JobCreateInput & { closesAt: Date | null }>
}

export function JobForm({ action, mode, initialData }: JobFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const defaultClosesAt =
    initialData?.closesAt instanceof Date
      ? initialData.closesAt.toISOString().split('T')[0]
      : ''

  const form = useForm<JobCreateInput>({
    // zodResolver type mismatch with coerce fields — cast needed
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(jobCreateSchema as any),
    defaultValues: {
      slug: initialData?.slug ?? '',
      title: initialData?.title ?? '',
      department: initialData?.department ?? '',
      location: initialData?.location ?? 'danang',
      type: initialData?.type ?? 'fulltime',
      description: initialData?.description ?? '',
      requirements: initialData?.requirements ?? '',
      benefits: initialData?.benefits ?? '',
      salaryMin: initialData?.salaryMin ?? undefined,
      salaryMax: initialData?.salaryMax ?? undefined,
      salaryNote: initialData?.salaryNote ?? 'Thoả thuận theo năng lực',
      status: (initialData?.status as JobCreateInput['status']) ?? 'DRAFT',
      openings: initialData?.openings ?? 1,
      closesAt: undefined,
    },
  })

  const titleValue = form.watch('title')

  useEffect(() => {
    if (mode === 'create' && titleValue && !form.getValues('slug')) {
      form.setValue('slug', slugify(titleValue), { shouldValidate: false })
    }
  }, [titleValue, mode, form])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const onSubmit = (data: any) => {
    startTransition(async () => {
      const result = await action(data)
      if (result.ok) {
        if (mode === 'create' && result.id) {
          router.push(`/admin/jobs/${result.id}/edit`)
        } else {
          router.push('/admin/jobs')
        }
      } else {
        alert(result.error ?? 'Co loi xay ra')
      }
    })
  }

  const errors = form.formState.errors

  const fieldClass =
    'w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[#7C3AED] focus:outline-none focus:ring-2 focus:ring-[#7C3AED]/20 disabled:bg-gray-50'
  const labelClass = 'block text-sm font-semibold text-gray-700 mb-1'
  const errorClass = 'mt-1 text-xs text-red-600'

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8 max-w-4xl">
      {/* Section 1: Cơ bản */}
      <section className="rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="mb-5 font-bold text-gray-900">Thông tin cơ bản</h2>
        <div className="space-y-4">
          <div>
            <label className={labelClass}>Tiêu đề *</label>
            <input className={fieldClass} {...form.register('title')} placeholder="Ví dụ: Giáo viên Robotics cơ sở Nguyễn Hữu Thọ" />
            {errors.title && <p className={errorClass}>{errors.title.message}</p>}
          </div>

          <div>
            <label className={labelClass}>Slug (URL) *</label>
            <input className={fieldClass} {...form.register('slug')} placeholder="giao-vien-robotics-hai-chau" />
            {errors.slug && <p className={errorClass}>{errors.slug.message}</p>}
            <p className="mt-1 text-xs text-gray-400">URL: /tuyen-dung/{form.watch('slug') || '...'}</p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className={labelClass}>Phòng ban *</label>
              <select className={fieldClass} {...form.register('department')}>
                <option value="">-- Chọn --</option>
                {DEPARTMENTS.map((d) => (
                  <option key={d.value} value={d.value}>{d.label}</option>
                ))}
              </select>
              {errors.department && <p className={errorClass}>{errors.department.message}</p>}
            </div>

            <div>
              <label className={labelClass}>Địa điểm *</label>
              <select className={fieldClass} {...form.register('location')}>
                {LOCATIONS.map((l) => (
                  <option key={l.value} value={l.value}>{l.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className={labelClass}>Hình thức *</label>
              <select className={fieldClass} {...form.register('type')}>
                {JOB_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </section>

      {/* Section 2: Nội dung Markdown */}
      <section className="rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="mb-5 font-bold text-gray-900">Nội dung (Markdown)</h2>
        <div className="space-y-4">
          <div>
            <label className={labelClass}>Mô tả công việc *</label>
            <textarea
              className={fieldClass}
              rows={10}
              placeholder="## Mô tả&#10;&#10;- Trách nhiệm 1&#10;- Trách nhiệm 2"
              {...form.register('description')}
            />
            {errors.description && <p className={errorClass}>{errors.description.message}</p>}
          </div>

          <div>
            <label className={labelClass}>Yêu cầu *</label>
            <textarea
              className={fieldClass}
              rows={8}
              placeholder="## Yêu cầu&#10;&#10;- Tốt nghiệp..."
              {...form.register('requirements')}
            />
            {errors.requirements && <p className={errorClass}>{errors.requirements.message}</p>}
          </div>

          <div>
            <label className={labelClass}>Quyền lợi *</label>
            <textarea
              className={fieldClass}
              rows={8}
              placeholder="## Quyền lợi&#10;&#10;- Lương..."
              {...form.register('benefits')}
            />
            {errors.benefits && <p className={errorClass}>{errors.benefits.message}</p>}
          </div>
          <p className="text-xs text-gray-400">Hỗ trợ Markdown: **bold**, *italic*, ## heading, - bullet list</p>
        </div>
      </section>

      {/* Section 3: Lương & Chỉ tiêu */}
      <section className="rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="mb-5 font-bold text-gray-900">Lương & Chỉ tiêu</h2>
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className={labelClass}>Lương min (VND)</label>
              <input
                className={fieldClass}
                type="number"
                placeholder="7000000"
                {...form.register('salaryMin', { setValueAs: (v) => (v === '' ? null : Number(v)) })}
              />
            </div>
            <div>
              <label className={labelClass}>Lương max (VND)</label>
              <input
                className={fieldClass}
                type="number"
                placeholder="15000000"
                {...form.register('salaryMax', { setValueAs: (v) => (v === '' ? null : Number(v)) })}
              />
            </div>
            <div>
              <label className={labelClass}>Ghi chú lương</label>
              <input
                className={fieldClass}
                placeholder="Thoả thuận theo năng lực"
                {...form.register('salaryNote')}
              />
            </div>
          </div>
          <p className="text-xs text-gray-400">Nếu điền Ghi chú lương → hiển thị ghi chú thay vì dải lương.</p>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass}>Số chỉ tiêu</label>
              <input
                className={fieldClass}
                type="number"
                min="1"
                {...form.register('openings', { valueAsNumber: true })}
              />
            </div>
            <div>
              <label className={labelClass}>Hạn nộp CV</label>
              <input
                className={fieldClass}
                type="date"
                defaultValue={defaultClosesAt}
                {...form.register('closesAt')}
              />
            </div>
          </div>
        </div>
      </section>

      {/* Section 4: Trạng thái */}
      <section className="rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="mb-5 font-bold text-gray-900">Trạng thái</h2>
        <div>
          <label className={labelClass}>Trạng thái hiển thị</label>
          <select className={`${fieldClass} max-w-xs`} {...form.register('status')}>
            {JOB_STATUS.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
          <ul className="mt-3 space-y-1 text-xs text-gray-500">
            <li><strong>DRAFT</strong>: chỉ admin thấy, không xuất hiện trên /tuyen-dung</li>
            <li><strong>OPEN</strong>: hiển thị public, Google Jobs có thể index</li>
            <li><strong>CLOSED</strong>: đã đóng tuyển, ẩn khỏi public</li>
            <li><strong>ON_HOLD</strong>: tạm dừng, ẩn khỏi public</li>
          </ul>
        </div>
      </section>

      {/* Actions */}
      <div className="flex gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="inline-flex items-center gap-2 rounded-lg bg-[#7C3AED] px-5 py-2.5 text-sm font-bold text-white hover:opacity-90 disabled:opacity-60"
        >
          {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          {isPending ? 'Đang lưu...' : mode === 'create' ? 'Tạo JD' : 'Cập nhật'}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded-lg border border-gray-200 px-5 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-50"
        >
          Huỷ
        </button>
      </div>
    </form>
  )
}
