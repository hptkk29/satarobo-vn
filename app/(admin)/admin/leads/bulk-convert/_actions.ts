'use server'

// Chốt hàng loạt lead ĐÃ ĐĂNG KÝ (nhập liệu ban đầu CS1/CS2) — wiring Server Action
// → lib/crm/bulk-convert. Quyền: leads:import (chặt hơn convert thường vì có nhánh
// bỏ qua guard tiền) + students:create + enrollments:create. Cách ly cơ sở bằng
// passesScope per-lead trên đường ghi (mẫu import registered).

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { resolveActor } from '@/lib/auth/actor'
import { checkPermission } from '@/lib/auth/check-permission'
import { scopedDb } from '@/lib/db-scope'
import { getAuditActor } from '@/lib/audit/log'
import {
  convertOneLeadBackfill,
  type BulkConvertLeadResult,
} from '@/lib/crm/bulk-convert'

const MAX_LEADS_PER_CALL = 20

const studentSchema = z.object({
  leadChildId: z.string().trim().optional().nullable(),
  name: z.string().trim().min(1, 'Tên học viên bắt buộc').max(120),
  dob: z.string().trim().optional().or(z.literal('')),
  classId: z.string().trim().min(1, 'Chọn lớp cho học viên'),
  consentMedia: z.boolean().optional(),
})

const leadItemSchema = z.object({
  leadId: z.string().trim().min(1),
  students: z.array(studentSchema).min(1, 'Cần ít nhất 1 học viên').max(10),
  paid: z
    .object({
      amount: z.number().int().positive('Số tiền phải > 0'),
      paidDate: z
        .string()
        .trim()
        .regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày đóng không hợp lệ'),
      note: z.string().trim().max(300).optional().or(z.literal('')),
    })
    .optional()
    .nullable(),
})

const bulkSchema = z.object({
  items: z.array(leadItemSchema).min(1).max(MAX_LEADS_PER_CALL),
})

export type BulkConvertActionResult =
  | { ok: true; results: BulkConvertLeadResult[] }
  | { ok: false; error: string }

export async function bulkConvertLeadsAction(input: unknown): Promise<BulkConvertActionResult> {
  const session = await auth()
  if (!session?.user) return { ok: false, error: 'Chưa đăng nhập' }

  // leads:import = quyền của SUPER_ADMIN/CENTER_MANAGER (đường nhập liệu); kèm 2
  // quyền của convert thường (tạo học viên + ghi danh).
  if (
    !(await checkPermission('leads:import')) ||
    !(await checkPermission('students:create')) ||
    !(await checkPermission('enrollments:create'))
  ) {
    return { ok: false, error: 'Không có quyền chốt hàng loạt (cần leads:import + students:create + enrollments:create)' }
  }

  const parsed = bulkSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Dữ liệu không hợp lệ' }
  }

  const actor = await resolveActor(session.user.id)
  const { actorId, actorName } = getAuditActor(session)
  const auditActor = { id: actorId, name: actorName }

  // Cách ly cơ sở TRƯỚC khi ghi: đọc lô lead qua scopedDb (auto-scope) — lead ngoài
  // cơ sở của actor không hiện trong kết quả ⇒ chặn ngay tại đây, service không chạy.
  const sdb = scopedDb(actor)
  const leadIds = parsed.data.items.map((it) => it.leadId)
  const visibleLeads = await sdb.lead.findMany({
    where: { id: { in: leadIds }, deletedAt: null },
    select: { id: true },
  })
  const visible = new Set(visibleLeads.map((l) => l.id))

  const results: BulkConvertLeadResult[] = []
  for (const item of parsed.data.items) {
    if (!visible.has(item.leadId)) {
      results.push({
        leadId: item.leadId,
        ok: false,
        code: 'OUT_OF_SCOPE',
        message: 'Lead không tồn tại hoặc thuộc cơ sở khác — ngoài phạm vi của bạn',
      })
      continue
    }

    try {
      results.push(
        await convertOneLeadBackfill(auditActor, {
          leadId: item.leadId,
          students: item.students.map((s) => ({
            leadChildId: s.leadChildId || null,
            name: s.name,
            dob: s.dob ? new Date(s.dob) : null,
            classId: s.classId,
            consentMedia: s.consentMedia === true,
          })),
          paid:
            item.paid && item.paid.amount > 0
              ? {
                  amount: item.paid.amount,
                  paidDate: new Date(`${item.paid.paidDate}T12:00:00+07:00`),
                  note: item.paid.note || null,
                }
              : null,
        }),
      )
    } catch (err) {
      // 1 lead vỡ không được kéo cả lô — ghi lỗi dòng rồi đi tiếp.
      console.error('[bulk-convert] lead failed', item.leadId, err)
      results.push({
        leadId: item.leadId,
        ok: false,
        code: 'INTERNAL',
        message: err instanceof Error ? err.message : 'Lỗi không xác định',
      })
    }
  }

  revalidatePath('/leads')
  revalidatePath('/students')
  revalidatePath('/enrollments')
  revalidatePath('/orders')
  revalidatePath('/dashboard')

  return { ok: true, results }
}
