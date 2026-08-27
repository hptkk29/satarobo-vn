'use client'

// G-04 — nút "Tuỳ chọn cột" của bảng lead.
//
// Ba ràng buộc đã có sẵn, đừng phá:
//  · KHÔNG thêm thư viện kéo-thả. Dùng HTML5 DnD thuần theo đúng khuôn kanban lead
//    đang chạy trên prod (`leads-kanban.tsx`).
//  · Kéo-thả HTML5 KHÔNG dùng được bằng bàn phím, và trên cảm ứng thì không chạy.
//    Nút ▲/▼ là đường CHÍNH (mobile 375px + a11y), kéo-thả chỉ là tiện ích desktop.
//  · Danh sách cột đến từ danh mục ở server (`lib/tables/lead-columns.ts`) — component
//    này KHÔNG được tự khai thêm nhãn cột nào.
//
// Cột PII chỉ được gắn NHÃN "đã che" ở đây khi người xem không có quyền xem PII.
// Nhãn đó là lời giải thích, KHÔNG phải hàng rào: dữ liệu đã bị che ở server trước
// khi rời máy chủ (`maskLeadPiiFields`), nên bật cột lên cũng chỉ ra bản đã che.

import { useState, useTransition } from 'react'
import { ArrowDown, ArrowUp, Columns3, GripVertical, Loader2, Plus, RotateCcw, X } from 'lucide-react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import {
  saveLeadTableColumnsAction,
  resetLeadTableColumnsAction,
} from '../_column-actions'

export type PickerColumn = {
  key: string
  label: string
  group: string
  pii?: boolean
}

export function ColumnPicker({
  tableKey,
  visible,
  hidden,
  piiMasked,
}: {
  tableKey: string
  visible: PickerColumn[]
  hidden: PickerColumn[]
  /** Người xem KHÔNG có `leads:view-pii` → chú thích "đã che" trên cột nhạy cảm. */
  piiMasked: boolean
}) {
  const [open, setOpen] = useState(false)
  const [dangHien, setDangHien] = useState<PickerColumn[]>(visible)
  const [dangAn, setDangAn] = useState<PickerColumn[]>(hidden)
  const [keo, setKeo] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function moDong(next: boolean) {
    if (pending) return
    if (next) {
      // Mở lại sau khi huỷ: bỏ mọi chỉnh sửa dở, quay về đúng cái đang chạy.
      setDangHien(visible)
      setDangAn(hidden)
      setKeo(null)
    }
    setOpen(next)
  }

  function doiCho(tu: number, den: number) {
    setDangHien((ds) => {
      if (den < 0 || den >= ds.length || tu === den) return ds
      const moi = [...ds]
      const [lay] = moi.splice(tu, 1)
      if (!lay) return ds
      moi.splice(den, 0, lay)
      return moi
    })
  }

  function tha(keyDich: string) {
    if (!keo || keo === keyDich) return
    const tu = dangHien.findIndex((c) => c.key === keo)
    const den = dangHien.findIndex((c) => c.key === keyDich)
    if (tu < 0 || den < 0) return
    doiCho(tu, den)
    setKeo(null)
  }

  function an(key: string) {
    const cot = dangHien.find((c) => c.key === key)
    if (!cot) return
    setDangHien((ds) => ds.filter((c) => c.key !== key))
    setDangAn((ds) => [...ds, cot])
  }

  function hien(key: string) {
    const cot = dangAn.find((c) => c.key === key)
    if (!cot) return
    setDangAn((ds) => ds.filter((c) => c.key !== key))
    setDangHien((ds) => [...ds, cot])
  }

  function luu() {
    if (dangHien.length === 0) {
      toast.error('Phải giữ lại ít nhất một cột.')
      return
    }
    startTransition(async () => {
      const res = await saveLeadTableColumnsAction({
        tableKey,
        visible: dangHien.map((c) => c.key),
      })
      if (!res.ok) {
        toast.error(res.error ?? 'Không lưu được tuỳ chọn cột')
        return
      }
      toast.success('Đã lưu tuỳ chọn cột của bạn.')
      setOpen(false)
    })
  }

  function khoiPhuc() {
    startTransition(async () => {
      const res = await resetLeadTableColumnsAction({ tableKey })
      if (!res.ok) {
        toast.error(res.error ?? 'Không khôi phục được')
        return
      }
      toast.success('Đã khôi phục bộ cột mặc định.')
      setOpen(false)
    })
  }

  const theoNhom = groupBy(dangAn)

  return (
    <>
      {/* Dialog CONTROLLED + nút onClick — khuôn đang dùng khắp repo (không DialogTrigger). */}
      <button
        type="button"
        onClick={() => moDong(true)}
        className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-semibold text-muted-foreground hover:bg-muted hover:text-foreground"
        title="Chọn cột hiển thị trên bảng lead"
      >
        <Columns3 className="h-4 w-4" />
        <span className="hidden sm:inline">Tuỳ chọn cột</span>
      </button>

      <Dialog open={open} onOpenChange={moDong}>
        <DialogContent className="max-h-[90vh] w-[min(96vw,72rem)] max-w-[72rem] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Tuỳ chọn cột</DialogTitle>
            <DialogDescription>
              Cấu hình này là <strong>của riêng bạn</strong> — không ảnh hưởng người khác.
              Kéo thả để đổi thứ tự (hoặc dùng nút ▲ ▼ trên điện thoại).
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
            {/* Đang hiện — kéo thả sắp thứ tự */}
            <section>
              <h3 className="mb-2 text-sm font-bold text-foreground">
                Đang hiện ({dangHien.length})
              </h3>
              <ul className="space-y-1.5">
                {dangHien.map((cot, i) => (
                  <li
                    key={cot.key}
                    draggable
                    onDragStart={() => setKeo(cot.key)}
                    onDragEnd={() => setKeo(null)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => tha(cot.key)}
                    className={`flex items-center gap-1.5 rounded-lg border border-border bg-card px-2 py-1.5 ${ keo === cot.key ? 'opacity-50' : '' }`}
                  >
                    <GripVertical
                      aria-hidden
                      className="h-4 w-4 shrink-0 cursor-grab text-muted-foreground"
                    />
                    <span className="min-w-0 flex-1 break-words text-sm leading-snug text-foreground">
                      {cot.label}
                      {piiMasked && cot.pii && (
                        <span className="ml-1 text-xs text-muted-foreground">(đã che)</span>
                      )}
                    </span>
                    <button
                      type="button"
                      onClick={() => doiCho(i, i - 1)}
                      disabled={i === 0}
                      aria-label={`Đưa cột ${cot.label} lên trên`}
                      className="rounded p-1 text-muted-foreground hover:bg-muted disabled:opacity-30"
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => doiCho(i, i + 1)}
                      disabled={i === dangHien.length - 1}
                      aria-label={`Đưa cột ${cot.label} xuống dưới`}
                      className="rounded p-1 text-muted-foreground hover:bg-muted disabled:opacity-30"
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => an(cot.key)}
                      aria-label={`Bỏ cột ${cot.label} khỏi bảng`}
                      className="rounded p-1 text-state-danger-ink hover:bg-state-danger-soft"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
                {dangHien.length === 0 && (
                  <li className="rounded-lg border border-dashed border-border px-2 py-3 text-center text-xs text-muted-foreground">
                    Chưa chọn cột nào
                  </li>
                )}
              </ul>
            </section>

            {/* Đang ẩn — bật lên */}
            <section>
              <h3 className="mb-2 text-sm font-bold text-foreground">
                Cột chưa dùng ({dangAn.length})
              </h3>
              {dangAn.length === 0 ? (
                <p className="text-xs text-muted-foreground">Đã bật hết cột hiện có.</p>
              ) : (
                <div className="space-y-3">
                  {theoNhom.map(([nhom, cots]) => (
                    <div key={nhom}>
                      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {nhom}
                      </p>
                      <ul className="space-y-1.5">
                        {cots.map((cot) => (
                          <li key={cot.key}>
                            <button
                              type="button"
                              onClick={() => hien(cot.key)}
                              className="flex w-full items-center gap-1.5 rounded-lg border border-dashed border-border px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
                            >
                              <Plus className="h-3.5 w-3.5 shrink-0" />
                              <span className="min-w-0 flex-1 break-words leading-snug">
                                {cot.label}
                                {piiMasked && cot.pii && (
                                  <span className="ml-1 text-xs">(đã che)</span>
                                )}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          {piiMasked && (
            <p className="rounded-lg bg-muted p-2.5 text-xs text-muted-foreground">
              Tài khoản của bạn không có quyền xem thông tin cá nhân của lead. Bật các cột
              đánh dấu <em>(đã che)</em> vẫn chỉ hiện bản đã che — đây không phải lỗi.
            </p>
          )}

          <DialogFooter className="gap-2 sm:justify-between">
            <Button type="button" variant="ghost" onClick={khoiPhuc} disabled={pending}>
              <RotateCcw className="mr-1.5 h-4 w-4" />
              Khôi phục mặc định
            </Button>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => moDong(false)} disabled={pending}>
                Huỷ
              </Button>
              <Button type="button" onClick={luu} disabled={pending}>
                {pending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                Lưu
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

/** Gom cột ẩn theo nhóm, GIỮ thứ tự xuất hiện (thứ tự đó đến từ danh mục). */
function groupBy(cots: PickerColumn[]): [string, PickerColumn[]][] {
  const map = new Map<string, PickerColumn[]>()
  for (const c of cots) {
    const ds = map.get(c.group)
    if (ds) ds.push(c)
    else map.set(c.group, [c])
  }
  return [...map.entries()]
}
