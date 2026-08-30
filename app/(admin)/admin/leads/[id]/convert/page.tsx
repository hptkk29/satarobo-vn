import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { auth } from '@/lib/auth'
import { checkPermission } from '@/lib/auth/check-permission'
import { scopedDb } from '@/lib/db-scope'
import { resolveActor } from '@/lib/auth/actor'
import { isConvertV2Enabled } from '@/lib/flags'
import { LEAD_STATUS_LABEL } from '@/lib/leads/status'
import { getLeadPaymentSummary } from '@/lib/payments/summary'
import { LeadPaymentCard } from '../../_components/lead-payment-card'
import { ConvertForm } from './convert-form'
import { formatPhoneVN } from "@/lib/phone";

export const metadata = { title: 'Chuyển đổi | Admin' }
export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ id: string }>
}

export default async function ConvertV2Page({ params }: Props) {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const { id } = await params

  // Flag OFF → form v2 không khả dụng, quay lại flow cũ ở trang chi tiết lead.
  if (!isConvertV2Enabled()) redirect(`/leads/${id}`)

  const canConvert =
    (await checkPermission('students:create')) && (await checkPermission('enrollments:create'))
  if (!canConvert) redirect(`/leads/${id}`)

  const sdb = scopedDb(await resolveActor(session.user.id))
  const lead = await sdb.lead.findFirst({
    where: { id, deletedAt: null },
    select: {
      id: true,
      parentName: true,
      phone: true,
      email: true,
      status: true,
      centerId: true,
      assignedToId: true,
      childName: true,
      children: {
        orderBy: { createdAt: 'asc' },
        select: { id: true, fullName: true, dob: true, interestedCourseId: true },
      },
    },
  })
  if (!lead) notFound()

  // Scope: SALE (chỉ view-own) chỉ thao tác lead của mình.
  if (!(await checkPermission('leads:view-all', { centerId: lead.centerId })) && lead.assignedToId !== session.user.id) {
    redirect('/leads?view=kanban')
  }

  // Tóm tắt thanh toán (đã nộp / tổng phải thu / còn thiếu) + điều kiện chốt.
  const paymentSummary = await getLeadPaymentSummary(sdb, lead.id)

  // FL2-01 — đơn hàng học phí gắn lead (tạo trước ở /orders/new?leadId=...) để chia
  // 1/2 đợt khi convert. Lấy đơn COURSE mới nhất của lead.
  const courseOrder = await sdb.order.findFirst({
    where: { leadId: lead.id, type: 'COURSE' },
    orderBy: { createdAt: 'desc' },
    select: { id: true, totalAmount: true },
  })

  // Lớp đang mở (ưu tiên cùng cơ sở lead) + giá khoá để snapshot.
  const classes = await sdb.class.findMany({
    where: {
      deletedAt: null,
      status: { in: ['PLANNED', 'RECRUITING', 'ACTIVE'] },
      ...(lead.centerId ? { centerId: lead.centerId } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: 200,
    select: {
      id: true,
      name: true,
      classCode: true,
      courseId: true,
      course: { select: { id: true, name: true, price: true } },
    },
  })

  const classOptions = classes.map((c) => ({
    id: c.id,
    label: c.classCode ? `${c.classCode} · ${c.name}` : c.name,
    courseId: c.courseId,
    courseName: c.course?.name ?? '',
    listPrice: c.course?.price ?? 0,
  }))

  const prefillStudents = (lead.children.length > 0
    ? lead.children.map((c) => ({
        leadChildId: c.id,
        name: c.fullName,
        dob: c.dob ? c.dob.toISOString().slice(0, 10) : '',
        courseId: c.interestedCourseId ?? '',
      }))
    : [
        {
          leadChildId: null,
          name: lead.childName ?? '',
          dob: '',
          courseId: '',
        },
      ]
  )

  return (
    <div className="max-w-4xl p-6">
      <Link
        href={`/leads/${lead.id}`}
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" /> Quay lại lead
      </Link>

      <div className="mb-6 border-b border-border pb-4">
        <h1 className="text-2xl font-bold text-foreground">Chuyển đổi</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {lead.parentName} · {formatPhoneVN(lead.phone)}
          {lead.email ? ` · ${lead.email}` : ''} · Trạng thái:{' '}
          <span className="font-medium">{LEAD_STATUS_LABEL[lead.status] ?? lead.status}</span>
        </p>
      </div>

      {/* Khối thanh toán: đã nộp / tổng phải thu / còn thiếu + điều kiện chốt. */}
      <div className="mb-6">
        <LeadPaymentCard
          leadId={lead.id}
          summary={paymentSummary}
          canCreateOrder={await checkPermission('orders:create')}
        />
      </div>

      <ConvertForm
        leadId={lead.id}
        defaultParentName={lead.parentName}
        defaultParentEmail={lead.email ?? ''}
        defaultParentPhone={formatPhoneVN(lead.phone)}
        prefillStudents={prefillStudents}
        classes={classOptions}
        order={courseOrder}
      />
    </div>
  )
}
