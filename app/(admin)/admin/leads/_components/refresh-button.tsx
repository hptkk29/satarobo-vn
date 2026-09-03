'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { RefreshCw } from 'lucide-react'

/**
 * Nút "Làm mới" cho màn danh sách Lead — nạp lại dữ liệu NGAY TRÊN TRANG.
 *
 * VÌ SAO KHÔNG BẢO NGƯỜI DÙNG BẤM F5: F5 tải lại cả tài liệu — mất vị trí cuộn, đóng
 * mọi hộp thoại/bộ lọc đang mở, và với màn Kanban thì cuộn lại từ đầu. `router.refresh()`
 * chỉ nạp lại phần RSC: dữ liệu mới, còn state phía client giữ nguyên.
 *
 * Trang Lead luôn render động (đọc `searchParams` + `auth()` → cookie), nên lượt refresh
 * này chắc chắn chạm DB chứ không trả bản đã lưu đệm.
 *
 * ⚠️ `useTransition` là thứ cho biết lượt refresh ĐÃ XONG: `router.refresh()` trả về
 * `void` ngay lập tức (nó không phải Promise), nên `await` nó là vô nghĩa — không có nó
 * thì vòng xoay tắt trước khi dữ liệu về, người dùng tưởng đã xong trong khi chưa.
 */
export function LeadsRefreshButton() {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  // null = chưa bấm lần nào. Chỉ hiện SAU khi bấm nên không có chuyện giờ máy chủ khác
  // giờ trình duyệt gây lệch hydrate (server render một đằng, client vẽ lại một nẻo).
  const [lastAt, setLastAt] = useState<string | null>(null)

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() =>
          startTransition(() => {
            router.refresh()
            // Giờ VN tường minh: máy chủ chạy UTC nhưng chuỗi này dựng ở TRÌNH DUYỆT,
            // và người dùng đọc nó theo giờ Việt Nam.
            setLastAt(
              new Date().toLocaleTimeString('vi-VN', {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                timeZone: 'Asia/Ho_Chi_Minh',
              }),
            )
          })
        }
        disabled={pending}
        title="Nạp lại danh sách để thấy lead mới, không cần F5"
        className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50"
      >
        <RefreshCw className={`h-4 w-4 ${pending ? 'animate-spin' : ''}`} />
        {pending ? 'Đang tải…' : 'Làm mới'}
      </button>
      {lastAt && !pending && (
        <span className="text-xs text-muted-foreground">Cập nhật {lastAt}</span>
      )}
    </div>
  )
}
