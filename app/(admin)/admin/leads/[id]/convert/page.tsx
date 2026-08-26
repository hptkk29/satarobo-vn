import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { auth } from '@/lib/auth'
import { checkPermission, canViewLeadPii } from '@/lib/auth/check-permission'
import { maskLeadPiiFields } from '@/lib/lead/pii'
import { scopedDb } from '@/lib/db-scope'
import { resolveActor } from '@/lib/auth/actor'
import { isConvertV2Enabled } from '@/lib/flags'
import { LEAD_STATUS_LABEL } from '@/lib/leads/status'
import { getLeadPaymentSummary } from '@/lib/payments/summary'
import { LeadPaymentCard } from '../../_components/lead-payment-card'
import { ConvertForm } from './convert-form'

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

  // S-1 — che PII trước khi dựng giao diện. Cổng vào đây là `students:create` +
  // `enrollments:create`, mà Quản lý cơ sở có CẢ HAI trong khi KHÔNG còn
  // `leads:view-pii` (Q9) ⇒ trước S-1 màn này in nguyên tên + SĐT khách.
  const canViewPii = await canViewLeadPii()
  const piiLead = maskLeadPiiFields(lead, canViewPii)

  // ⚠️ Ô ĐIỀN SẴN thì để TRỐNG, KHÔNG điền bản che.
  //
  // Đây là chỗ dễ làm sai nhất của cả việc này. `submitConvertV2` nhận thẳng
  // `parentName`/`parentPhone` từ trình duyệt. SĐT còn có lưới đỡ — schema validate
  // bằng `phoneVn` (canonical) nên "090xxxx456" bị từ chối. TÊN thì KHÔNG có lưới
  // nào: điền sẵn "Nguyễn T. L." rồi bấm Lưu là tạo ra một phụ huynh mang đúng cái
  // tên đã đục, im lặng, và không ai phát hiện cho tới lúc gọi tên khách.
  //
  // Để trống là hỏng SỚM và hỏng TO: form chặn ngay ("Nhập đủ tên và SĐT phụ
  // huynh"). Người chốt đang ngồi với khách nên hỏi miệng là có — họ mất quyền đọc
  // SĐT trong CRM, không mất khả năng nghe khách đọc số.
  const dienSan = canViewPii
    ? { ten: lead.parentName, email: lead.email ?? '', sdt: lead.phone }
    : { ten: '', email: '', sdt: '' }

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
          {piiLead.parentName} · {piiLead.phone}
          {piiLead.email ? ` · ${piiLead.email}` : ''} · Trạng thái:{' '}
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

      {/* `conflictHref` truyền tường minh: màn gộp hồ sơ trùng là của khu quản
          trị, và chỗ gọi mới là chỗ biết khu mình có màn đó hay không. */}
      {!canViewPii && (
        <p className="mb-4 rounded-xl border border-amber-500/40 bg-card p-4 text-sm text-muted-foreground">
          <strong className="text-amber-600 dark:text-amber-500">
            Bạn không có quyền xem liên hệ của khách
          </strong>
          {' — '}ô Tên và SĐT phụ huynh để trống, xin khách đọc rồi nhập tay. Đừng
          chép lại chuỗi đã che ở dòng trên: nó không phải thông tin thật.
        </p>
      )}

      <ConvertForm
        conflictHref="/convert-conflicts"
        leadId={lead.id}
        defaultParentName={dienSan.ten}
        defaultParentEmail={dienSan.email}
        defaultParentPhone={dienSan.sdt}
        prefillStudents={prefillStudents}
        classes={classOptions}
        order={courseOrder}
      />
    </div>
  )
}
