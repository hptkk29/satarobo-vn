'use client'

// NHÓM 03 (Việc 4) — Scaffold UI demo cho hợp đồng `ConvertLeadResult`
// (`lib/leads/convert-types.ts`). Minh hoạ 4 nhánh case UI theo `technical.md` §4:
//   - DUPLICATE_STUDENT → Dialog liệt kê `candidates[]`, chọn "Dùng hồ sơ này" hoặc
//     "Tạo hồ sơ mới".
//   - CLASS_FULL → toast lỗi.
//   - PAYMENT_REQUIRED → toast + link sang màn ghi nhận khoản thu.
//   - PERMISSION_DENIED → toast lỗi.
//
// ⚠️ KHÔNG PHẢI FLOW THẬT — dùng mock/stub trả sẵn từng case (không gọi DB/action).
// TODO: nối vào convertLeadV2 thật khi Kiệt xong (hoặc map từ `ConvertV2Result` hiện có
// ở `lib/crm/convert-lead-v2.ts` nếu BGĐ chọn giữ 1 hợp đồng duy nhất).
//
// ⚠️ Component này CHƯA được mount ở `[id]/page.tsx`: trang lead detail đã có nút
// "Chuyển đổi" thật (→ `/leads/[id]/convert`, dùng `convertLeadV2` production, xử lý
// PARENT_CONFLICT qua `/admin/convert-conflicts`). Mount thêm 1 nút "Convert" demo song
// song sẽ gây nhầm lẫn cho Sale thật — để riêng file này chờ quyết định của BGĐ/Kiệt
// (giữ song song 2 hợp đồng hay thay thế flow cũ).

import { useState, useTransition } from 'react'
import { AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import type { ConvertLeadResult, ConvertLeadDuplicateCandidate } from '@/lib/leads/convert-types'

// ─── Mock/stub — mỗi hàm trả cứng 1 case theo hợp đồng ConvertLeadResult ───────
// (KHÔNG gọi DB/action thật — chỉ để demo UI render đúng theo từng nhánh lỗi.)

function mockConvertDuplicate(): ConvertLeadResult {
  const candidates: ConvertLeadDuplicateCandidate[] = [
    { studentId: 'stu_demo_1', fullName: 'Nguyễn Văn A', dob: '2016-05-12', centerName: 'CS1 — 211 Nguyễn Hữu Thọ' },
    { studentId: 'stu_demo_2', fullName: 'Nguyễn Văn A', dob: '2016-05-12', centerName: 'CS2 — 114 Hoàng Diệu' },
  ]
  return {
    ok: false,
    error: {
      code: 'DUPLICATE_STUDENT',
      message: 'Đã tìm thấy hồ sơ học viên trùng tên + ngày sinh với phụ huynh này.',
      candidates,
    },
  }
}

function mockConvertClassFull(): ConvertLeadResult {
  return {
    ok: false,
    error: { code: 'CLASS_FULL', message: 'Lớp đã đủ sĩ số — vui lòng chọn lớp khác.' },
  }
}

function mockConvertPaymentRequired(): ConvertLeadResult {
  return {
    ok: false,
    error: {
      code: 'PAYMENT_REQUIRED',
      message: 'Cần ghi nhận khoản thanh toán trước khi chốt chuyển đổi.',
    },
  }
}

function mockConvertPermissionDenied(): ConvertLeadResult {
  return {
    ok: false,
    error: { code: 'PERMISSION_DENIED', message: 'Bạn không có quyền chuyển đổi lead này.' },
  }
}

// ─── UI demo ────────────────────────────────────────────────────────────────

export function ConvertDialogDemo({ leadId }: { leadId: string }) {
  const [pending, startTransition] = useTransition()
  const [duplicateOpen, setDuplicateOpen] = useState(false)
  const [candidates, setCandidates] = useState<ConvertLeadDuplicateCandidate[]>([])

  function handle(result: ConvertLeadResult) {
    if (result.ok) {
      toast.success(`Chuyển đổi OK: student ${result.data.studentId}`)
      return
    }
    switch (result.error.code) {
      case 'DUPLICATE_STUDENT':
        setCandidates(result.error.candidates ?? [])
        setDuplicateOpen(true)
        break
      case 'CLASS_FULL':
        toast.error(result.error.message)
        break
      case 'PAYMENT_REQUIRED':
        toast.error(result.error.message, {
          action: {
            label: 'Ghi nhận khoản thu',
            onClick: () => {
              window.location.href = `/leads/${leadId}`
            },
          },
        })
        break
      case 'PERMISSION_DENIED':
        toast.error(result.error.message)
        break
    }
  }

  function chooseExisting(studentId: string) {
    // TODO: nối vào convertLeadV2 thật — gọi lại action với { existingStudentId: studentId }.
    startTransition(() => {
      toast.info(`(demo) Dùng lại hồ sơ ${studentId} — chờ nối action thật`)
      setDuplicateOpen(false)
    })
  }

  function createNew() {
    // TODO: nối vào convertLeadV2 thật — gọi lại action với { forceCreate: true }.
    startTransition(() => {
      toast.info('(demo) Tạo hồ sơ mới — chờ nối action thật')
      setDuplicateOpen(false)
    })
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="outline" disabled={pending} onClick={() => handle(mockConvertDuplicate())}>
        Demo: trùng hồ sơ
      </Button>
      <Button size="sm" variant="outline" disabled={pending} onClick={() => handle(mockConvertClassFull())}>
        Demo: lớp đầy
      </Button>
      <Button size="sm" variant="outline" disabled={pending} onClick={() => handle(mockConvertPaymentRequired())}>
        Demo: chưa thanh toán
      </Button>
      <Button size="sm" variant="outline" disabled={pending} onClick={() => handle(mockConvertPermissionDenied())}>
        Demo: không có quyền
      </Button>

      <Dialog open={duplicateOpen} onOpenChange={setDuplicateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" /> Trùng hồ sơ học viên
            </DialogTitle>
            <DialogDescription>
              Chọn dùng lại 1 hồ sơ có sẵn, hoặc tạo hồ sơ mới cho học viên này.
            </DialogDescription>
          </DialogHeader>
          <ul className="space-y-2">
            {candidates.map((c) => (
              <li
                key={c.studentId}
                className="flex items-center justify-between gap-2 rounded-lg border border-gray-200 p-2 text-sm"
              >
                <div>
                  <p className="font-medium text-gray-900">{c.fullName}</p>
                  <p className="text-xs text-gray-500">
                    {c.dob} · {c.centerName}
                  </p>
                </div>
                <Button size="sm" disabled={pending} onClick={() => chooseExisting(c.studentId)}>
                  Dùng hồ sơ này
                </Button>
              </li>
            ))}
          </ul>
          <DialogFooter>
            <Button variant="outline" disabled={pending} onClick={createNew}>
              Tạo hồ sơ mới
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
