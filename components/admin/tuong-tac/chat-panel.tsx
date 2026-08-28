"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

// E-04 — khung kéo ra (drawer) mở hội thoại NGAY TRONG dashboard, không rời trang.
//
// 🔴 BA CÁI BẪY CỦA `sheet.tsx`, đều đã đo, đừng "đơn giản hoá" lại:
//
// 1. **CHIỀU CAO** — `side="bottom"`/`"top"` là `h-auto`; chỉ `left`/`right` mới `h-full`.
//    `ChatThread` root là `h-full min-h-[60vh] flex-col overflow-hidden`, mà `h-full`
//    trong cha `h-auto` KHÔNG có gì để tham chiếu ⇒ vùng cuộn tin hành xử sai. Dùng
//    `side="right"`.
//
// 2. **CHIỀU RỘNG** — `sheet.tsx` có `data-[side=right]:sm:max-w-sm` (384px, quá hẹp cho
//    chat). Truyền `className="sm:max-w-2xl"` KHÔNG ăn, vì hai lý do cộng dồn:
//      • tailwind-merge gom theo BỘ MODIFIER: `{data-[side=right], sm}` khác `{sm}` nên
//        hai class không khử nhau, cả hai cùng tồn tại;
//      • biến thể `data-[side=…]` biên dịch thành selector kèm attribute ⇒ độ đặc hiệu
//        CAO HƠN class thường ⇒ nó thắng.
//    Phải override bằng ĐÚNG cùng bộ modifier: `data-[side=right]:sm:max-w-2xl`.
//
// 3. **KHOẢNG ĐỆM** — `SheetContent` có `flex flex-col gap-4` và không tự padding.
//    `ChatThread` tự có viền + bo góc ⇒ `gap-0 p-0` để không có khe 16px lơ lửng.
//    KHÔNG sửa `sheet.tsx` cho riêng E-04 — nó là component dùng chung.
//
// 🔴 Trạng thái mở/đóng sống trong URL (`?chat=<id>`), KHÔNG trong state client. Bộ lọc
// A-02 cũng sống trong URL và nội dung panel do RSC dựng; giữ ở state client thì hoặc
// mất bộ lọc, hoặc phải sinh thêm 4 Server Action để kéo dữ liệu về.

/** Khoá URL mở panel. Đặt hằng số để trang cha và panel không bao giờ gõ lệch nhau. */
export const CHAT_PARAM = "chat";

export function ChatPanel({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function close() {
    // Xoá ĐÚNG một khoá, giữ nguyên phần còn lại — đó là cách bộ lọc A-02 sống sót qua
    // thao tác đóng panel. Dựng URL mới từ đầu là mất khoảng ngày người dùng vừa chọn.
    const next = new URLSearchParams(searchParams.toString());
    next.delete(CHAT_PARAM);
    const qs = next.toString();
    // `scroll: false` — không kéo trang về đầu khi đóng; người dùng đang đứng ở bảng E-03.
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  return (
    <Sheet
      open
      onOpenChange={(o) => {
        if (!o) close();
      }}
    >
      <SheetContent side="right" className="data-[side=right]:sm:max-w-2xl gap-0 p-0">
        {/* Base UI Dialog đòi có title cho a11y; tiêu đề thật nằm trong ChatThread. */}
        <SheetHeader className="sr-only">
          <SheetTitle>Hội thoại</SheetTitle>
        </SheetHeader>
        <div className="min-h-0 flex-1">{children}</div>
      </SheetContent>
    </Sheet>
  );
}
